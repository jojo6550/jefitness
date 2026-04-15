const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripeService = require('../services/stripe');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { daysLeftUntil, calculateNextRenewalDate } = require('../utils/dateUtils');
const StripePlan = require('../models/StripePlan');
const { logger } = require('../services/logger');

/** Compute daysLeft from effective end date (overrideEndDate || currentPeriodEnd) */
function computeDaysLeft(subscription) {
  const effectiveEnd = subscription.overrideEndDate || subscription.currentPeriodEnd;
  return daysLeftUntil(effectiveEnd);
}

/** Map Stripe status to custom app status */
function mapStripeStatusToAppStatus(stripeStatus) {
  if (['active', 'trialing'].includes(stripeStatus)) return 'active';
  if (['incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid', 'paused'].includes(stripeStatus)) return 'cancelled';
  return 'trialing'; // fallback
}

/** Determine billing environment from Stripe secret key prefix */
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
   * Create a Stripe Checkout session and return its URL - UNCHANGED
   */
  createCheckout: asyncHandler(async (req, res) => {
    const { planId } = req.body;
    logger.info(`[CHECKOUT] Request: userId=${req.user.id}, planId="${planId}"`);

    const user = await User.findById(req.user.id).select('+stripeCustomerId');
    if (!user) throw new ValidationError('User not found');

    logger.info(
      `[CHECKOUT] User ${user._id}: email=${user.email}, existingCustomerId=${user.stripeCustomerId || 'NONE'}`
    );

    let stripeCustomerId;

    // Always refresh customer to avoid stale DB values
    logger.info(`[CHECKOUT] Force refreshing customer via email: ${user.email}`);

    try {
      const customer = await stripeService.createOrRetrieveCustomer(user.email, null, {
        userId: user._id.toString(),
        app: 'jefitness',
      });

      stripeCustomerId = customer.id;
      logger.info(`[CHECKOUT] Fresh customer: ${stripeCustomerId}`);

      // Update user record with verified customer ID (idempotent)
      if (user.stripeCustomerId !== stripeCustomerId) {
        user.stripeCustomerId = stripeCustomerId;
        user.billingEnvironment = getBillingEnv();
        await user.save();
        logger.info(`[CHECKOUT] Updated user.stripeCustomerId: ${stripeCustomerId}`);
      }
    } catch (customerError) {
      logger.error('[CHECKOUT] Customer creation failed:', {
        error: customerError.message,
      });
      return res.status(400).json({
        success: false,
        message: `Failed to create customer account: ${customerError.message}. Please try again or contact support.`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/pages/subscriptions.html?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pages/subscriptions.html?canceled=true`;

    logger.info(
      `[CHECKOUT] Creating session: customer=${stripeCustomerId}, plan=${planId}`
    );

    let session;
    try {
      session = await stripeService.createCheckoutSession(
        stripeCustomerId,
        planId,
        successUrl,
        cancelUrl
      );
      logger.info(`[CHECKOUT] Session created: ${session.id}`);
    } catch (sessionError) {
      logger.error('[CHECKOUT] Session creation failed:', {
        error: sessionError.message,
      });

      // If customer specifically invalid, clear stale DB record
      if (
        sessionError.message.includes('Customer account invalid') ||
        sessionError.message.includes('No such customer')
      ) {
        logger.info('[CHECKOUT] Clearing stale customerId from user');
        user.stripeCustomerId = null;
        await user.save();
      }

      return res.status(400).json({
        success: false,
        message: `Payment setup failed: ${sessionError.message}. Please refresh and try again.`,
      });
    }

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
   * Get the user's subscription (exactly one document)
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({ userId: req.user.id });

    if (!subscription) {
      // Auto-create trialing sub for new users
      const defaultSub = await Subscription.create({
        userId: req.user.id,
        stripeCustomerId: req.user.stripeCustomerId || '',
        plan: '1-month',
        stripePriceId: '',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
        status: 'trialing',
        amount: 0,
        currency: 'jmd',
        billingEnvironment: getBillingEnv(),
      });
      return res.json({
        success: true,
        data: { ...defaultSub.toObject(), daysLeft: computeDaysLeft(defaultSub) },
      });
    }

    // Auto-heal: if active but effective end in past, re-sync from Stripe
    const effectiveEnd = subscription.overrideEndDate || subscription.currentPeriodEnd;
    const isActive = ['active', 'trialing'].includes(subscription.status);
    const periodEndInvalid = effectiveEnd <= new Date();

    if (isActive && periodEndInvalid && subscription.stripeSubscriptionId) {
      try {
        const stripe = stripeService.getStripe();
        if (stripe) {
          const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          if (stripeSub?.current_period_end) {
            const newStatus = mapStripeStatusToAppStatus(stripeSub.status);
            const subUpdate = await Subscription.findOneAndUpdate(
              { userId: req.user.id },
              {
                $set: {
                  currentPeriodStart: stripeSub.current_period_start
                    ? new Date(stripeSub.current_period_start * 1000)
                    : subscription.currentPeriodStart,
                  currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                  status: newStatus,
                },
              },
              { new: true }
            );
            subscription = subUpdate;
          }
        }
      } catch (healErr) {
        logger.warn('[GET-SUBSCRIPTION] Auto-heal from Stripe failed:', {
          error: healErr.message,
        });
      }
    }

    res.json({
      success: true,
      data: { ...subscription.toObject(), daysLeft: computeDaysLeft(subscription) },
    });
  }),

  /**
   * Verify checkout session - UPSERT single sub doc by userId
   */
  verifyCheckoutSession: asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId.trim();

    logger.info(`[VERIFY-SESSION] for sessionId: ${sessionId}, userId: ${req.user.id}`);

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ success: false, message: 'Stripe config error' });
    }

    let session;
    try {
      session = await stripeService.getCheckoutSession(sessionId);
    } catch (error) {
      logger.error('[VERIFY-SESSION] Session fetch failed:', error.message);
      return res.status(400).json({ success: false, message: error.message });
    }

    if (!session || session.payment_status !== 'paid' || session.mode !== 'subscription') {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    let stripeSub;
    try {
      const stripe = stripeService.getStripe();
      stripeSub = await stripe.subscriptions.retrieve(session.subscription);
    } catch (fetchErr) {
      logger.error('[VERIFY-SESSION] Stripe sub fetch failed:', fetchErr.message);
    }

    const customerId = typeof session.customer === 'object' ? session.customer.id : session.customer;
    const user = await User.findOne({ stripeCustomerId: customerId, _id: req.user.id });
    if (!user) return res.status(403).json({ success: false, message: 'Session ownership mismatch' });

    if (stripeSub) {
      const priceItem = stripeSub.items?.data[0];
      const priceId = priceItem?.price?.id;
      const planName = await stripeService.getPlanNameFromPriceId(priceId);
      const periodStart = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date();
      const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : calculateNextRenewalDate(periodStart, 'month', 1);

      // UPSERT single sub doc BY USER ID (1:1 model)
      const subscription = await Subscription.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            stripeCustomerId: typeof stripeSub.customer === 'object' ? stripeSub.customer.id : stripeSub.customer,
            stripeSubscriptionId: stripeSub.id,
            plan: planName,
            stripePriceId: priceId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            status: 'active', // Successful payment -> active
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
            canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
            amount: priceItem?.price?.unit_amount || 0,
            currency: priceItem?.price?.currency || 'jmd',
            billingEnvironment: getBillingEnv(),
            checkoutSessionId: sessionId,
            overrideEndDate: null, // Clear admin override on Stripe purchase
          },
        },
        { upsert: true, new: true, runValidators: true }
      );

      await User.findByIdAndUpdate(user._id, { $set: { subscriptionStatus: 'active' } });

      res.json({ success: true, data: { ...subscription.toObject(), daysLeft: computeDaysLeft(subscription) } });
    } else {
      res.json({ success: true, data: null });
    }
  }),

  /**
   * Cancel user's subscription (single doc)
   */
  cancel: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    if (!subscription) throw new NotFoundError('No subscription found');

    // Cancel Stripe if exists
    if (subscription.stripeSubscriptionId) {
      try {
        await stripeService.cancelSubscription(subscription.stripeSubscriptionId, req.body.atPeriodEnd || false);
      } catch (stripeErr) {
        logger.error('Stripe cancel non-fatal error:', stripeErr.message);
      }
    }

    const newStatus = 'cancelled';
    const now = new Date();
    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      {
        $set: {
          status: newStatus,
          canceledAt: now,
        },
        $push: {
          statusHistory: {
            status: newStatus,
            changedAt: now,
            reason: 'User cancelled',
          },
        },
      }
    );

    await User.findByIdAndUpdate(req.user.id, { $set: { subscriptionStatus: newStatus } });

    res.json({ success: true, message: 'Subscription cancelled' });
  }),

  /**
   * Sync from Stripe - upsert single doc
   */
  refresh: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('stripeCustomerId');
    const subscription = await Subscription.findOne({ userId: req.user.id });

    let stripeSub = null;
    try {
      if (subscription?.stripeSubscriptionId) {
        stripeSub = await stripeService.getStripe().subscriptions.retrieve(subscription.stripeSubscriptionId);
      } else if (user.stripeCustomerId) {
        const subs = await stripeService.getStripe().subscriptions.list({ customer: user.stripeCustomerId, limit: 1 });
        if (subs.data.length) stripeSub = subs.data[0];
      }
    } catch (err) {
      logger.warn('Stripe sync failed:', err.message);
    }

    if (stripeSub) {
      const priceItem = stripeSub.items?.data[0];
      const newStatus = mapStripeStatusToAppStatus(stripeSub.status);

      const updatedSub = await Subscription.findOneAndUpdate(
        { userId: req.user.id },
        {
          $set: {
            stripeSubscriptionId: stripeSub.id,
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            status: newStatus,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
            lastWebhookEventAt: new Date(),
          },
        },
        { new: true }
      );

      await User.findByIdAndUpdate(req.user.id, { $set: { subscriptionStatus: newStatus } });

      res.json({
        success: true,
        data: { ...updatedSub.toObject(), daysLeft: computeDaysLeft(updatedSub) },
        message: 'Synced with Stripe',
      });
    } else {
      res.json({ success: true, data: subscription ? subscription.toObject() : null });
    }
  }),

  /**
   * Get invoices - verify ownership by userId
   */
  getSubscriptionInvoices: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params; // Stripe ID
    const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId, userId: req.user.id });

    if (!subscription) throw new NotFoundError('Subscription not found');

    try {
      const invoices = await stripeService.getSubscriptionInvoices(subscription.stripeSubscriptionId);
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

