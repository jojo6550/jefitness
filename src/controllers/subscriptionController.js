const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripeService = require('../services/stripe');
const { getPrimaryAppUrl } = require('../config/security');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { daysLeftUntil, calculateNextRenewalDate } = require('../utils/dateUtils');
const StripePlan = require('../models/StripePlan');
const { logger } = require('../services/logger');

/** Map Stripe status to 3 states: active, cancelled, or trialing */
function mapStripeStatusTo3States(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'canceled') return 'cancelled';
  // past_due, incomplete, incomplete_expired, unpaid, paused → cancelled (no access)
  return 'cancelled';
}

/** Format appointment date for email display */
function formatApptDateForEmail(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const subscriptionController = {
  /**
   * Get available plans
   */
  getPlans: asyncHandler(async (req, res) => {
    const plans = await stripeService.getPlanPricing();
    res.json({ success: true, data: { plans } });
  }),

  /**
 * Create Stripe Checkout session for subscription.
   * If queued=true and active sub exists: queues upgrade after current ends.
   * Else: immediate subscription (rejects if active).
   */
  createCheckout: asyncHandler(async (req, res) => {
    const { plan, queued } = req.body;

    if (!plan || !['1-month', '3-month', '6-month', '12-month'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get or create Stripe customer
    const customer = await stripeService.createOrRetrieveCustomer(req.user.email);

    // Get current subscription if exists
    const currentSub = await Subscription.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'trialing'] },
    });

      // Handle queued subscription upgrade (starts after current ends)
      if (queued) {
        if (!currentSub) {
          return res.status(400).json({ 
            error: 'No active subscription to queue upgrade after. Subscribe directly instead.' 
          });
        }
        // Compute queued params
        const trialEndTimestamp = Math.floor(currentSub.currentPeriodEnd.getTime() / 1000);
        
        // Validate Stripe trial_end requirement: must be >= now + 2 days
        const nowTimestamp = Math.floor(Date.now() / 1000);
        const minTrialEnd = nowTimestamp + 172800; // 2 days in seconds
        const daysLeft = daysLeftUntil(currentSub.currentPeriodEnd);
        if (trialEndTimestamp < minTrialEnd) {
          return res.status(400).json({ 
            error: `Cannot queue upgrade: only ${daysLeft} days left. Need 2+ days. Subscribe directly or wait.` 
          });
        }
        
        const successUrl = `${getPrimaryAppUrl()}/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${getPrimaryAppUrl()}/subscriptions?cancelled=true`;
        // Create queued checkout session
        const session = await stripeService.createQueuedCheckoutSession(customer.id, plan, trialEndTimestamp, successUrl, cancelUrl);
        res.json({ sessionId: session.id, url: session.url });
        return;
      }

    // Normal immediate subscription - reject if active exists
    if (currentSub) {
      return res.status(400).json({ 
        error: 'Already have active subscription. Complete/cancel current plan first or contact support.' 
      });
    }

    // Always immediate billing (no trial_end)
    const trialEndTimestamp = null;
    const metadata = { plan };

    // Create Stripe checkout session
    const session = await stripeService.createCheckoutSession(
      customer.id,
      plan,
      trialEndTimestamp,
      metadata
    );

    res.json({ sessionId: session.id, url: session.url });

  }),

  /**
   * Get the current user's active subscription (single doc per user model).
   * Returns null if no active subscription.
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    logger.debug('getCurrentSubscription', {
      userId: req.user._id,
      type: typeof req.user._id,
    });

    const subscription = await Subscription.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'trialing'] },
    }).select('-__v');

    if (!subscription) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        daysLeft: daysLeftUntil(subscription.currentPeriodEnd),
      },
    });
  }),

  /**
   * Verify a completed Stripe Checkout session.
   * Returns the subscription if already created by webhook.
   */
  verifyCheckoutSession: asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await stripeService.getCheckoutSession(sessionId);

    if (!session || session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Invalid or unpaid session' });
    }

    // Verify ownership: session customer must match user's customer
    const user = await User.findById(req.user._id);
    if (!user.stripeCustomerId) {
      // Create customer if missing
      const customer = await stripeService.createOrRetrieveCustomer(user.email);
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    if (session.customer !== user.stripeCustomerId) {
      return res.status(403).json({ error: 'Customer mismatch' });
    }

    // Subscription was already created by webhook, just return it
    const subscription = await Subscription.findOne({
      userId: req.user._id,
      stripeSubscriptionId: session.subscription,
    });

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription not found' });
    }

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        daysLeft: daysLeftUntil(subscription.currentPeriodEnd),
      },
    });
  }),

  /**
   * Cancel the user's queued (trialing, isQueuedPlan) subscription.
   * Kept for backward compatibility with existing routes.
   */
  cancelQueuedPlan: asyncHandler(async (req, res) => {
    const queuedSub = await Subscription.findOne({
      userId: req.user._id,
      status: 'trialing',
      isQueuedPlan: true
    });

    if (!queuedSub) {
      return res.status(404).json({ error: 'No queued subscription found' });
    }

    // Delete queued subscription record (no Stripe cancel needed for trial/queued)
    await queuedSub.deleteOne();
    logger.info(`[SUBSCRIPTIONS] Queued subscription deleted for user ${req.user._id}`);

    res.json({ 
      success: true, 
      message: 'Queued subscription cancelled successfully' 
    });
  }),

  /**
   * Cancel a subscription by its DB ID.
   * atPeriodEnd: if true, schedule cancellation at period end; if false, cancel immediately.
   */
  cancel: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params;
    const { atPeriodEnd } = req.body;

    const subscription = await Subscription.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'trialing'] },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (atPeriodEnd) {
      // Set cancel_at_period_end on Stripe sub
      if (subscription.stripeSubscriptionId) {
        await stripeService.cancelSubscription(subscription.stripeSubscriptionId, true);
      }
      // DB will be updated by webhook when Stripe sends customer.subscription.updated
      res.json({ message: 'Cancellation scheduled for period end' });
    } else {
      // Cancel immediately
      if (subscription.stripeSubscriptionId) {
        await stripeService.cancelSubscription(subscription.stripeSubscriptionId, false);
      }
      // Update DB
      subscription.status = 'cancelled';
      subscription.canceledAt = new Date();
      await subscription.save();

      res.json({ message: 'Subscription cancelled immediately' });
    }
  }),

  /**
   * Refresh subscription status from Stripe and update DB.
   * Returns the latest subscription state.
   */
  refresh: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.json({ subscription: null });
    }

    // Fetch latest from Stripe
    const stripeSub = await stripeService.getSubscription(
      subscription.stripeSubscriptionId
    );

    // Map Stripe status to 3 states
    const status = mapStripeStatusTo3States(stripeSub.status);

    // Update DB
    subscription.status = status;
    subscription.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
    await subscription.save();

    res.json({
      subscription: {
        ...subscription.toObject(),
        daysLeft: daysLeftUntil(subscription.currentPeriodEnd),
      },
    });
  }),

  /**
   * Get Stripe invoices for a user's subscription.
   * Verifies ownership before fetching.
   */
  getSubscriptionInvoices: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params; // Stripe subscription ID (sub_xxx)

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId: req.user.id,
    });

    if (!subscription) {
      throw new NotFoundError('Subscription not found or access denied');
    }

    try {
      const invoices = await stripeService.getSubscriptionInvoices(
        subscription.stripeSubscriptionId
      );

      const formattedInvoices = invoices.map(i => ({
        id: i.id,
        number: i.number || i.id.slice(-8),
        created: i.created * 1000,
        status: i.status,
        amount_paid: i.amount_paid || 0,
        total: i.amount_due || 0,
        currency: i.currency,
        pdf_url: i.invoice_pdf || i.hosted_invoice_url,
      })).sort((a, b) => b.created - a.created);

      res.json({ success: true, data: formattedInvoices });
    } catch (stripeError) {
      logger.error(`[INVOICES] Stripe error for sub ${subscriptionId}:`, {
        error: stripeError.message,
      });
      // Graceful fallback — frontend handles an empty array
      res.json({ success: true, data: [], message: 'No invoices available' });
    }
  }),
};

module.exports = subscriptionController;

