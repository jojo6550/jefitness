const subscriptionService = require('../services/subscriptionService');
const stripeService = require('../services/stripe');
const User = require('../models/User');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { daysLeftUntil } = require('../utils/dateUtils');
const { logger } = require('../services/logger');

/** Backward-compatible daysLeft for API responses */
function computeDaysLeft(subscription) {
  return daysLeftUntil(subscription.currentPeriodEnd);
}

/** Map Stripe status to app state */
function mapStripeStatusToAppStatus(stripeStatus) {
  if (['active', 'trialing'].includes(stripeStatus)) return 'active';
  if (['incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid', 'paused'].includes(stripeStatus)) return 'cancelled';
  return 'trialing';
}

/** Determine billing environment */
function getBillingEnv() {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
}

const subscriptionController = {
  /**
   * Get available plans - UNCHANGED
   */
  getPlans: asyncHandler(async (req, res) => {
    const plans = await stripeService.getPlanPricing();
    res.json({ success: true, data: { plans } });
  }),

  /**
   * Create Stripe Checkout session - UNCHANGED (no sub logic)
   */
  createCheckout: asyncHandler(async (req, res) => {
    const { planId } = req.body;
    logger.info(`[CHECKOUT] userId=${req.user.id}, planId="${planId}"`);

    const user = await User.findById(req.user.id).select('+stripeCustomerId');
    if (!user) throw new ValidationError('User not found');

    let stripeCustomerId;
    try {
      const customer = await stripeService.createOrRetrieveCustomer(user.email, null, {
        userId: user._id.toString(),
        app: 'jefitness',
      });
      stripeCustomerId = customer.id;

      // Update user (idempotent)
      if (user.stripeCustomerId !== stripeCustomerId) {
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }
    } catch (customerError) {
      logger.error('[CHECKOUT] Customer error:', customerError.message);
      return res.status(400).json({
        success: false,
        message: `Customer error: ${customerError.message}`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/pages/subscriptions.html?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pages/subscriptions.html?canceled=true`;

    const session = await stripeService.createCheckoutSession(
      stripeCustomerId,
      planId,
      successUrl,
      cancelUrl
    );

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        customerId: stripeCustomerId,
        planId,
      },
    });
  }),

  /**
   * Get current subscription (service handles getOrCreate + expiration)
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
    await subscriptionService.checkAndHandleExpiration(subscription);

    res.json({
      success: true,
      data: { 
        ...subscription.toObject(), 
        daysLeft: computeDaysLeft(subscription),
        hasAccess: subscriptionService.hasActiveAccess(subscription)
      },
    });
  }),

  /**
   * Verify checkout session → createOrUpdateFromStripe
   */
  verifyCheckoutSession: asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId.trim();

    const session = await stripeService.getCheckoutSession(sessionId);
    if (!session || session.payment_status !== 'paid' || session.mode !== 'subscription') {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const stripeSub = await stripeService.getStripe().subscriptions.retrieve(session.subscription);
    const customerId = stripeSub.customer;

    // Verify user owns customer
    const user = await User.findOne({ stripeCustomerId: customerId, _id: req.user.id });
    if (!user) return res.status(403).json({ success: false, message: 'Session ownership mismatch' });

    // Use service (handles upsert + state mapping)
    const subscription = await subscriptionService.createOrUpdateFromStripe(stripeSub, user._id);

    res.json({ 
      success: true, 
      data: { 
        ...subscription.toObject(), 
        daysLeft: computeDaysLeft(subscription) 
      } 
    });
  }),

  /**
   * Cancel subscription (service handles Stripe + state)
   */
  cancel: asyncHandler(async (req, res) => {
    await subscriptionService.cancelSubscription(req.user.id, true); // cancel Stripe
    res.json({ success: true, message: 'Subscription cancelled (access until period end)' });
  }),

  /**
   * Force sync from Stripe (service handles)
   */
  refresh: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('stripeCustomerId');
    
    let stripeSub = null;
    try {
      // Try existing sub first, then customer subs
      const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
      if (subscription.stripeSubscriptionId) {
        stripeSub = await stripeService.getStripe().subscriptions.retrieve(subscription.stripeSubscriptionId);
      } else if (user.stripeCustomerId) {
        const subs = await stripeService.getStripe().subscriptions.list({ customer: user.stripeCustomerId, limit: 1 });
        if (subs.data.length) stripeSub = subs.data[0];
      }
    } catch (err) {
      logger.warn('Stripe refresh failed:', err.message);
    }

    if (stripeSub) {
      const subscription = await subscriptionService.createOrUpdateFromStripe(stripeSub, req.user.id);
      res.json({
        success: true,
        data: { ...subscription.toObject(), daysLeft: computeDaysLeft(subscription) },
        message: 'Synced with Stripe',
      });
    } else {
      const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
      res.json({ success: true, data: subscription.toObject() });
    }
  }),

  /**
   * Get invoices - Service verifies ownership
   */
  getSubscriptionInvoices: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params; // Stripe ID
    
    // Service gets sub, verifies userId match
    const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
    if (subscription.stripeSubscriptionId !== subscriptionId) {
      throw new NotFoundError('Subscription not found');
    }

    try {
      const invoices = await stripeService.getSubscriptionInvoices(subscriptionId);
      const formattedInvoices = invoices.map(inv => ({
        id: inv.id,
        number: inv.number || inv.id.slice(-8),
        created: inv.created * 1000,
        status: inv.status,
        amount_paid: inv.amount_paid || 0,
        total: inv.amount_due || 0,
        currency: inv.currency,
        pdf_url: inv.invoice_pdf || inv.hosted_invoice_url,
      })).sort((a, b) => b.created - a.created);

      res.json({ success: true, data: formattedInvoices });
    } catch (err) {
      res.json({ success: true, data: [], message: 'No invoices available' });
    }
  }),
};

module.exports = subscriptionController;

