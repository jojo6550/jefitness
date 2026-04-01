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

/** Compute daysLeft from a subscription's currentPeriodEnd (midnight-normalised, clamped to 0) */
function computeDaysLeft(subscription) {
  return daysLeftUntil(subscription.currentPeriodEnd);
}

/** Determine billing environment from Stripe secret key prefix */
function getBillingEnv() {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
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
   * Create a Stripe Checkout session and return its URL
   */
  createCheckout: asyncHandler(async (req, res) => {
    const { planId } = req.body;
    logger.info(`[CHECKOUT] Request: userId=${req.user.id}, planId="${planId}"`);

    const user = await User.findById(req.user.id).select('+stripeCustomerId');
    if (!user) throw new ValidationError('User not found');

    logger.info(
      `[CHECKOUT] User ${user._id}: email=${user.email}, existingCustomerId=${user.stripeCustomerId || 'NONE'}`,
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
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
          ? 'test'
          : 'production';
        await user.save();
        logger.info(`[CHECKOUT] Updated user.stripeCustomerId: ${stripeCustomerId}`);
      }
    } catch (customerError) {
      logger.error('[CHECKOUT] Customer creation failed:', { error: customerError.message });
      return res.status(400).json({
        success: false,
        message: `Failed to create customer account: ${customerError.message}. Please try again or contact support.`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/pages/subscriptions.html?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pages/subscriptions.html?canceled=true`;

    logger.info(`[CHECKOUT] Creating session: customer=${stripeCustomerId}, plan=${planId}`);

    let session;
    try {
      session = await stripeService.createCheckoutSession(
        stripeCustomerId,
        planId,
        successUrl,
        cancelUrl,
      );
      logger.info(`[CHECKOUT] Session created: ${session.id}`);
    } catch (sessionError) {
      logger.error('[CHECKOUT] Session creation failed:', { error: sessionError.message });

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
   * Get the current user's most recent subscription
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    // Prefer the most recent active subscription; fall back to most recently created.
    let subscription = await Subscription.findOne({
      userId: req.user.id,
      status: { $in: ['active', 'trialing', 'past_due', 'paused', 'incomplete'] },
    }).sort({ utcCreatedAt: -1 });

    if (!subscription) {
      subscription = await Subscription.findOne({ userId: req.user.id }).sort({
        utcCreatedAt: -1,
      });
    }

    if (!subscription) return res.json({ success: true, data: null });

    // Auto-heal: if active but currentPeriodEnd is missing or in the past, re-sync from Stripe
    const activeStatuses = ['active', 'trialing', 'past_due'];
    const periodEndInvalid =
      !subscription.currentPeriodEnd || subscription.currentPeriodEnd <= new Date();

    if (
      activeStatuses.includes(subscription.status) &&
      periodEndInvalid &&
      subscription.stripeSubscriptionId
    ) {
      try {
        const stripe = stripeService.getStripe();
        if (stripe) {
          const stripeSub = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId,
          );
          if (stripeSub?.current_period_end) {
            subscription = await Subscription.findByIdAndUpdate(
              subscription._id,
              {
                $set: {
                  currentPeriodStart: stripeSub.current_period_start
                    ? new Date(stripeSub.current_period_start * 1000)
                    : subscription.currentPeriodStart,
                  currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                  status: stripeSub.status,
                },
              },
              { new: true },
            );
          }
        }
      } catch (healErr) {
        logger.warn('[GET-SUBSCRIPTION] Auto-heal from Stripe failed:', { error: healErr.message });
      }
    }

    res.json({
      success: true,
      data: { ...subscription.toObject(), daysLeft: computeDaysLeft(subscription) },
    });
  }),

  /**
   * Verify a completed Stripe Checkout session.
   * Proactively upserts the subscription record so the user is never stuck in
   * "not yet active" limbo if the webhook fires late.
   */
  verifyCheckoutSession: asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId.trim();

    logger.info(`[VERIFY-SESSION] Starting verification for sessionId: ${sessionId}, userId: ${req.user.id}`);

    // Validate STRIPE_SECRET_KEY
    if (!process.env.STRIPE_SECRET_KEY) {
      logger.error('[VERIFY-SESSION] STRIPE_SECRET_KEY missing');
      return res.status(500).json({
        success: false,
        message: 'Stripe configuration error. Please contact support.',
      });
    }

    let session;
    try {
      session = await stripeService.getCheckoutSession(sessionId);
    } catch (error) {
      logger.error('[VERIFY-SESSION] Failed to fetch session:', { error: error.message, sessionId });
      return res.status(400).json({
        success: false,
        message: `Session fetch failed: ${error.message}`,
      });
    }

    if (!session) {
      logger.error('[VERIFY-SESSION] Session not found:', { sessionId });
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired checkout session',
      });
    }

    if (!session.customer) {
      logger.error('[VERIFY-SESSION] No customer in session:', { sessionId });
      return res.status(400).json({
        success: false,
        message: 'Session missing customer information',
      });
    }

    if (!session.subscription) {
      logger.error('[VERIFY-SESSION] No subscription in session:', { sessionId });
      return res.status(400).json({
        success: false,
        message: 'Session not linked to subscription',
      });
    }

    if (session.payment_status !== 'paid' || session.mode !== 'subscription') {
      logger.info('[VERIFY-SESSION] Session invalid:', {
        sessionId,
        payment_status: session.payment_status,
        mode: session.mode,
      });
      return res.status(400).json({
        success: false,
        message: 'Payment not completed or invalid session type',
      });
    }

    // Always re-fetch the subscription from Stripe on verify so period dates are
    // guaranteed fresh (webhooks may have saved an incomplete record before
    // Stripe finished setting up the subscription).
    let subscription = null;
    try {
      logger.info('[VERIFY-SESSION] Fetching subscription from Stripe:', { id: session.subscription });
      const stripe = stripeService.getStripe();
      if (!stripe) throw new Error('Stripe instance not available');

      const stripeSub = await stripe.subscriptions.retrieve(session.subscription);

      if (stripeSub) {
        const customerId =
          session.customer && typeof session.customer === 'object'
            ? session.customer.id
            : session.customer;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (!user) {
          logger.warn('[VERIFY-SESSION] User not found for customer:', { customer: session.customer });
        } else {
          const priceItem = stripeSub.items?.data[0];
          const priceId = priceItem?.price?.id;
          const billingEnv = getBillingEnv();
          const planName = await stripeService.getPlanNameFromPriceId(priceId);

          // Resolve period dates from Stripe; fall back to plan-interval arithmetic
          // if Stripe hasn't set current_period_end yet (e.g. subscription still initialising).
          const periodStart = stripeSub.current_period_start
            ? new Date(stripeSub.current_period_start * 1000)
            : new Date();
          let periodEnd;
          if (stripeSub.current_period_end) {
            periodEnd = new Date(stripeSub.current_period_end * 1000);
          } else {
            const planRecord = await StripePlan.findOne({
              stripePriceId: priceId,
              active: true,
            }).lean();
            periodEnd = calculateNextRenewalDate(
              periodStart,
              planRecord?.interval || 'month',
              planRecord?.intervalCount || 1,
            );
            logger.warn(
              `[VERIFY-SESSION] current_period_end missing from Stripe — computed from plan interval (${planRecord?.interval}x${planRecord?.intervalCount}): ${periodEnd.toISOString()}`,
            );
          }

          subscription = await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: stripeSub.id },
            {
              $set: {
                userId: user._id,
                stripeCustomerId:
                  typeof stripeSub.customer === 'object'
                    ? stripeSub.customer.id
                    : stripeSub.customer,
                stripeSubscriptionId: stripeSub.id,
                plan: planName,
                stripePriceId: priceId,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                status: stripeSub.status,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
                canceledAt: stripeSub.canceled_at
                  ? new Date(stripeSub.canceled_at * 1000)
                  : null,
                amount: priceItem?.price?.unit_amount || 0,
                currency: priceItem?.price?.currency || 'jmd',
                billingEnvironment: billingEnv,
                checkoutSessionId: sessionId,
              },
            },
            { upsert: true, new: true },
          );

          await User.findByIdAndUpdate(user._id, {
            $set: { stripeSubscriptionId: stripeSub.id, billingEnvironment: billingEnv },
          });
        }
      }
    } catch (fetchErr) {
      logger.error('[VERIFY-SESSION] Stripe fetch failed, falling back to DB:', { error: fetchErr.message });
      subscription = await Subscription.findOne({
        stripeSubscriptionId: session.subscription,
      });
    }

    if (!subscription) return res.json({ success: true, data: null });

    res.json({
      success: true,
      data: { ...subscription.toObject(), daysLeft: computeDaysLeft(subscription) },
    });
  }),

  /**
   * Cancel a subscription by its DB ID
   */
  cancel: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId: req.user.id,
    });

    if (!subscription) {
      throw new NotFoundError('Subscription not found or access denied');
    }

    // Cancel on Stripe first (source of truth)
    if (subscription.stripeSubscriptionId) {
      try {
        await stripeService.cancelSubscription(subscription.stripeSubscriptionId, false);
      } catch (stripeErr) {
        const msg = stripeErr.message || '';
        const alreadyGone =
          msg.includes('already canceled') ||
          msg.includes('No such subscription') ||
          msg.includes('does not exist') ||
          msg.includes('resource_missing');

        if (!alreadyGone) {
          // Non-fatal — log and continue so the DB record is still updated
          logger.error('Stripe cancel error (non-fatal)', { error: stripeErr.message });
        }
      }
    }

    // Update DB record — use findByIdAndUpdate with runValidators:false to avoid
    // Mongoose validation failures on older documents missing newly added fields
    const now = new Date();
    await Subscription.findByIdAndUpdate(
      subscription._id,
      {
        $set: { status: 'canceled', canceledAt: now },
        $push: {
          statusHistory: {
            status: 'canceled',
            changedAt: now,
            reason: 'User requested cancellation',
          },
        },
      },
      { runValidators: false },
    );

    // Best-effort user record sync
    try {
      await User.findByIdAndUpdate(req.user.id, {
        $set: { subscriptionStatus: 'canceled' },
      });
    } catch (userUpdateError) {
      logger.error('Failed to update user record after cancel', {
        error: userUpdateError.message,
      });
    }

    res.json({ success: true, message: 'Subscription canceled successfully' });
  }),

  /**
   * Force-sync subscription status from Stripe
   */
  refresh: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select(
      'stripeSubscriptionId stripeCustomerId',
    );

    if (!user.stripeSubscriptionId && !user.stripeCustomerId) {
      return res.json({
        success: true,
        data: null,
        message: 'No Stripe subscription linked to account',
      });
    }

    const stripe = stripeService.getStripe();
    const ACTIVE_STRIPE_STATUSES = [
      'active',
      'trialing',
      'past_due',
      'paused',
      'incomplete',
    ];
    let stripeSub = null;

    try {
      if (user.stripeSubscriptionId && stripe) {
        const candidate = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        // Only use it if it's still in an active-like state
        if (candidate && ACTIVE_STRIPE_STATUSES.includes(candidate.status)) {
          stripeSub = candidate;
        }
      }

      // If stored ID is missing, stale, or canceled — find the latest active sub via customer
      if (!stripeSub && user.stripeCustomerId && stripe) {
        for (const status of ['active', 'trialing', 'past_due', 'paused', 'incomplete']) {
          const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status,
            limit: 1,
          });
          if (subs.data.length > 0) {
            stripeSub = subs.data[0];
            break;
          }
        }
      }
    } catch (err) {
      logger.warn('Stripe subscription fetch failed', {
        userId: req.user.id,
        error: err.message,
      });
    }

    if (!stripeSub) {
      return res.json({
        success: true,
        data: null,
        message: 'No active Stripe subscription found',
      });
    }

    const priceItem = stripeSub.items?.data[0];
    const priceId = priceItem?.price?.id;
    const billingEnv = getBillingEnv();
    const planName = await stripeService.getPlanNameFromPriceId(priceId);

    const payload = {
      userId: user._id,
      stripeCustomerId: stripeSub.customer,
      stripeSubscriptionId: stripeSub.id,
      plan: planName,
      stripePriceId: priceId,
      currentPeriodStart: stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : new Date(),
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null,
      status: stripeSub.status,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      amount: priceItem?.price?.unit_amount || 0,
      currency: priceItem?.price?.currency || 'jmd',
      billingEnvironment: billingEnv,
      lastWebhookEventAt: new Date(),
    };

    const sub = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: stripeSub.id },
      { $set: payload },
      { upsert: true, new: true },
    );

    await User.findByIdAndUpdate(user._id, {
      $set: { stripeSubscriptionId: stripeSub.id, billingEnvironment: billingEnv },
    });

    res.json({
      success: true,
      data: { ...sub.toObject(), daysLeft: computeDaysLeft(sub) },
      message: 'Subscription refreshed from Stripe',
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
        subscription.stripeSubscriptionId,
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
      logger.error(`[INVOICES] Stripe error for sub ${subscriptionId}:`, { error: stripeError.message });
      // Graceful fallback — frontend handles an empty array
      res.json({ success: true, data: [], message: 'No invoices available' });
    }
  }),
};

module.exports = subscriptionController;
