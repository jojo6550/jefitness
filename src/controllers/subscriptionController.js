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

/** Compute daysLeft from a subscription's currentPeriodEnd (midnight-normalised, clamped to 0) */
function computeDaysLeft(subscription) {
  return daysLeftUntil(subscription.currentPeriodEnd);
}

/** Determine billing environment from Stripe secret key prefix */
function getBillingEnv() {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
}

/** Map Stripe status to 3 states: active, cancelled, or trialing */
function mapStripeStatusTo3States(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'canceled') return 'cancelled';
  // past_due, incomplete, incomplete_expired, unpaid, paused → cancelled (no access)
  return 'cancelled';
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

    const daysLeft = computeDaysLeft(subscription);

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        daysLeft,
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

    const daysLeft = computeDaysLeft(subscription);

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        daysLeft,
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

    const daysLeft = computeDaysLeft(subscription);

    res.json({
      subscription: {
        ...subscription.toObject(),
        daysLeft,
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

      const formattedInvoices = invoices
        .map(invoice => ({
          id: invoice.id,
          number: invoice.number || invoice.id.slice(-8),
          created: invoice.created * 1000, // Stripe seconds → JS ms
          status: invoice.status,
          amount_paid: invoice.amount_paid || 0,
          total: invoice.amount_due || 0,
          currency: invoice.currency,
          invoice_pdf: invoice.invoice_pdf,
          hosted_invoice_url: invoice.hosted_invoice_url,
          pdf_url: invoice.invoice_pdf || invoice.hosted_invoice_url,
        }))
        .sort((a, b) => b.created - a.created); // Newest first

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

// Export individual functions for testing
module.exports.getCurrentSubscription = subscriptionController.getCurrentSubscription;
module.exports.createCheckout = subscriptionController.createCheckout;
module.exports.verifyCheckoutSession = subscriptionController.verifyCheckoutSession;
module.exports.cancel = subscriptionController.cancel;
module.exports.refresh = subscriptionController.refresh;
module.exports.cancelQueuedPlan = subscriptionController.cancelQueuedPlan;

