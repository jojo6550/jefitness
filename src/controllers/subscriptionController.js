const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripeService = require('../services/stripe');
const { calculateSubscriptionEndDate } = require('../utils/dateUtils');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');

const subscriptionController = {
  /**
   * Get available plans
   */
  getPlans: asyncHandler(async (req, res) => {
    const plans = await stripeService.getPlanPricing();
    res.json({ success: true, data: { plans } });
  }),

  /**
   * Create a checkout session
   */
  createCheckout: asyncHandler(async (req, res) => {
    console.log('[CHECKOUT] Request body:', req.body);
    console.log('[CHECKOUT] User ID:', req.user?.id);
    const { planId } = req.body;

    // Fetch user to get/create their Stripe customer ID
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Create or retrieve Stripe customer if not already linked
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripeService.createOrRetrieveCustomer(
        user.email,
        null,
        { userId: user._id.toString() }
      );
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Build redirect URLs from the current request origin
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/pages/subscriptions.html?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pages/subscriptions.html?canceled=true`;

    try {
      const session = await stripeService.createCheckoutSession(
      stripeCustomerId,
      planId,
      successUrl,
      cancelUrl
    );

      res.json({ success: true, data: { sessionId: session.id, url: session.url } });
    } catch (error) {
      console.error('[CHECKOUT ERROR]', {
        planId: req.body.planId,
        userId: req.user?.id,
        userEmail: req.user?.email,
        error: error.message,
        stack: error.stack
      });
      throw error; // Re-throw for asyncHandler
    }
  }),

  /**
   * Get current user subscription (enhanced)
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findOne({ 
      userId: req.user.id
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.json({ success: true, data: null });
    }

    // Compute daysLeft
    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd;
    const daysLeft = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({ success: true, data: {
      ...subscription.toObject(),
      daysLeft: Math.max(0, daysLeft)
    } });
  }),

  /**
   * Verify checkout session — also proactively upserts the subscription so
   * the user is never stuck in "not yet active" limbo if the webhook is delayed.
   */
  verifyCheckoutSession: asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const stripeService = require('../services/stripe');
    const { PLAN_MAP } = require('../config/subscriptionConstants');

    const session = await stripeService.getCheckoutSession(sessionId);

    if (session.payment_status !== 'paid' || session.mode !== 'subscription') {
      return res.status(400).json({ success: false, error: 'Session not completed' });
    }

    // Try to find existing DB record first
    let subscription = await Subscription.findOne({
      stripeSubscriptionId: session.subscription
    });

    // If webhook hasn't fired yet, create the record proactively from Stripe data
    if (!subscription) {
      try {
        const stripe = stripeService.getStripe();
        const stripeSub = stripe ? await stripe.subscriptions.retrieve(session.subscription) : null;

        if (stripeSub) {
          const user = await User.findOne({ stripeCustomerId: session.customer });
          if (user) {
            const priceItem = stripeSub.items?.data[0];
            const priceId = priceItem?.price?.id;
            const plan = PLAN_MAP[priceId] || 'unknown-plan';
            const billingEnv = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';

            subscription = await Subscription.findOneAndUpdate(
              { stripeSubscriptionId: stripeSub.id },
              {
                $set: {
                  userId: user._id,
                  stripeCustomerId: stripeSub.customer,
                  stripeSubscriptionId: stripeSub.id,
                  plan,
                  stripePriceId: priceId,
                  currentPeriodStart: stripeSub.current_period_start
                    ? new Date(stripeSub.current_period_start * 1000)
                    : new Date(),
                  currentPeriodEnd: stripeSub.current_period_end
                    ? new Date(stripeSub.current_period_end * 1000)
                    : new Date(Date.now() + 30 * 86400000),
                  status: stripeSub.status,
                  cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
                  canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
                  amount: priceItem?.price?.unit_amount || 0,
                  currency: priceItem?.price?.currency || 'jmd',
                  billingEnvironment: billingEnv,
                  checkoutSessionId: sessionId
                }
              },
              { upsert: true, new: true }
            );

            // Sync subscription ID onto the User document
            await User.findByIdAndUpdate(user._id, {
              $set: { stripeSubscriptionId: stripeSub.id, billingEnvironment: billingEnv }
            });

            console.log(`✅ [verifyCheckout] Subscription upserted proactively: ${subscription._id} | plan: ${subscription.plan} | status: ${subscription.status}`);
          }
        }
      } catch (proactiveErr) {
        console.error('[verifyCheckout] Proactive upsert failed:', proactiveErr.message);
      }
    }

    if (!subscription) {
      return res.json({ success: true, data: null });
    }

    // Compute daysLeft
    const now = new Date();
    const daysLeft = Math.ceil((subscription.currentPeriodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        daysLeft: Math.max(0, daysLeft)
      }
    });
  }),

  /**
   * Cancel subscription
   */
  cancel: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params;

    console.log(`[CANCEL] Attempting to cancel subscription ${subscriptionId} for user ${req.user.id}`);

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId: req.user.id
    });

    if (!subscription) {
      console.warn(`[CANCEL] Subscription ${subscriptionId} not found for user ${req.user.id}`);
      throw new NotFoundError('Subscription not found or access denied');
    }

    // Step 1: Cancel on Stripe directly (do not rely on pre-save hook which may fail
    // validation on older documents missing required fields like billingEnvironment)
    if (subscription.stripeSubscriptionId) {
      try {
        await stripeService.cancelSubscription(subscription.stripeSubscriptionId, false);
        console.log(`[CANCEL] ✅ Stripe subscription ${subscription.stripeSubscriptionId} canceled`);
      } catch (stripeErr) {
        const msg = stripeErr.message || '';
        const alreadyGone =
          msg.includes('already canceled') ||
          msg.includes('No such subscription') ||
          msg.includes('does not exist') ||
          msg.includes('resource_missing');
        if (alreadyGone) {
          console.log(`[CANCEL] ℹ️ Stripe subscription already gone — continuing with DB update`);
        } else {
          // Non-fatal: log and continue so the DB record is still updated
          console.error(`[CANCEL] Stripe cancel error (non-fatal, continuing):`, stripeErr.message);
        }
      }
    } else {
      console.warn(`[CANCEL] No stripeSubscriptionId — marking canceled in DB only`);
    }

    // Step 2: Update DB using findByIdAndUpdate with runValidators:false
    // This avoids Mongoose validation failures on older documents that may be
    // missing fields added to the schema after the document was created (e.g. billingEnvironment)
    const now = new Date();
    await Subscription.findByIdAndUpdate(
      subscription._id,
      {
        $set: { status: 'canceled', canceledAt: now },
        $push: { statusHistory: { status: 'canceled', changedAt: now, reason: 'User requested cancellation' } }
      },
      { runValidators: false }
    );

    console.log(`[CANCEL] ✅ Subscription ${subscriptionId} marked canceled in DB`);

    // Step 3: Update user record (best-effort)
    try {
      await User.findByIdAndUpdate(req.user.id, {
        $set: { subscriptionStatus: 'canceled' }
      });
    } catch (userUpdateError) {
      console.error(`[CANCEL] Failed to update user ${req.user.id}:`, userUpdateError.message);
    }

    res.json({ success: true, message: 'Subscription canceled successfully' });
  }),

  /**
   * Refresh subscription from Stripe (force sync)
   * Fetches live data from Stripe and updates/creates DB record
   */
  refresh: asyncHandler(async (req, res) => {
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');
    const stripeService = require('../services/stripe');
    const { PLAN_MAP } = require('../config/subscriptionConstants');

    const user = await User.findById(req.user.id).select('stripeSubscriptionId stripeCustomerId');
    if (!user.stripeSubscriptionId && !user.stripeCustomerId) {
      return res.json({ success: true, data: null, message: 'No Stripe subscription linked to account' });
    }

    let stripeSub = null;
    const stripe = stripeService.getStripe();

    try {
      if (user.stripeSubscriptionId && stripe) {
        stripeSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } else if (user.stripeCustomerId && stripe) {
        // Fallback: List active subs for customer
        const subs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1
        });
        if (subs.data.length > 0) {
          stripeSub = subs.data[0];
        }
      }
    } catch (err) {
      console.warn(`Stripe fetch failed for user ${req.user.id}:`, err.message);
    }

    if (!stripeSub) {
      return res.json({ success: true, data: null, message: 'No active Stripe subscription found' });
    }

    // Build upsert payload (reuse webhook logic)
    const priceItem = stripeSub.items?.data[0];
    const priceId = priceItem?.price?.id;
    const plan = PLAN_MAP[priceId] || 'unknown';
    const billingEnv = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';

    const payload = {
      userId: user._id,
      stripeCustomerId: stripeSub.customer,
      stripeSubscriptionId: stripeSub.id,
      plan,
      stripePriceId: priceId,
      currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date(),
      currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null,
      status: stripeSub.status,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      amount: priceItem?.price?.unit_amount || 0,
      currency: priceItem?.price?.currency || 'jmd',
      billingEnvironment: billingEnv,
      lastWebhookEventAt: new Date()
    };

    const sub = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: stripeSub.id },
      { $set: payload },
      { upsert: true, new: true }
    );

    // Sync to user doc
    await User.findByIdAndUpdate(user._id, {
      $set: {
        stripeSubscriptionId: stripeSub.id,
        billingEnvironment: billingEnv
      }
    });

    // Compute daysLeft
    const now = new Date();
    const daysLeft = Math.ceil((sub.currentPeriodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: { ...sub.toObject(), daysLeft: Math.max(0, daysLeft) },
      message: 'Subscription refreshed from Stripe'
    });
  }),

  /**
   * Get invoices for a user's subscription
   * Verifies user owns subscription before fetching from Stripe
   */
  getSubscriptionInvoices: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params; // Stripe subscription ID (sub_xxx)
    const Subscription = require('../models/Subscription');
    const stripeService = require('../services/stripe');

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId: req.user.id
    });

    if (!subscription) {
      const msg = 'Subscription not found or access denied';
      console.warn(`[INVOICES] ${msg} | user: ${req.user.id} | sub: ${subscriptionId}`);
      throw new NotFoundError(msg);
    }

    try {
      const invoices = await stripeService.getSubscriptionInvoices(subscription.stripeSubscriptionId);
      
      // Transform for frontend (ensure required fields)
      const formattedInvoices = invoices.map(invoice => ({
        id: invoice.id,
        number: invoice.number || invoice.id.slice(-8),
        created: invoice.created * 1000, // Convert Stripe seconds to JS ms
        status: invoice.status,
        amount_paid: invoice.amount_paid || 0,
        total: invoice.amount_due || 0,
        currency: invoice.currency,
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        // Fallback for older invoices or test mode
        pdf_url: invoice.invoice_pdf || invoice.hosted_invoice_url
      })).sort((a, b) => b.created - a.created); // Newest first

      console.log(`[INVOICES] ✅ Fetched ${formattedInvoices.length} invoices for sub ${subscriptionId} (user ${req.user.id})`);
      
      res.json({
        success: true,
        data: formattedInvoices
      });
    } catch (stripeError) {
      console.error(`[INVOICES] Stripe error for sub ${subscriptionId}:`, stripeError.message);
      // Graceful fallback - frontend handles empty array
      res.json({ success: true, data: [], message: 'No invoices available' });
    }
  })
};

module.exports = subscriptionController;
