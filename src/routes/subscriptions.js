const express = require('express');
const { body, param, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionInvoices,
  createCheckoutSession,
  getPaymentMethods,
  PRICE_IDS,
  PLAN_PRICING
} = require('../services/stripe');

const router = express.Router();

// ===========================
// MIDDLEWARE
// ===========================

/**
 * Middleware to check if user is authenticated
 * If not authenticated and trying to access subscription, redirect to login
 */
const ensureAuthenticated = (req, res, next) => {
  if (!req.user || !req.user.id) {
    // For API calls, return 401
    if (req.path.startsWith('/api')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. Please log in to access subscriptions.'
        }
      });
    }
    // Otherwise, redirect to login (for browser requests)
    return res.status(401).json({
      success: false,
      error: {
        message: 'Please log in first',
        redirect: '/login.html'
      }
    });
  }
  next();
};

// ===========================
// PUBLIC ENDPOINTS (No Auth Required)
// ===========================

/**
 * GET /api/v1/subscriptions/plans
 * Get all available subscription plans with pricing
 */
router.get('/plans', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        plans: PLAN_PRICING,
        free: { amount: 0, currency: 'usd', duration: 'Unlimited', features: ['Basic access'] }
      }
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch plans' }
    });
  }
});

// ===========================
// AUTHENTICATED ENDPOINTS
// ===========================

/**
 * POST /api/v1/subscriptions/checkout-session
 * Create a Stripe Checkout session (with authentication)
 */
router.post('/checkout-session', auth, [
  body('plan').isIn(['1-month', '3-month', '6-month', '12-month']),
  body('successUrl').isURL(),
  body('cancelUrl').isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { plan, successUrl, cancelUrl } = req.body;
    const userId = req.user.id;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    // Validate required account fields
    if (!user.firstName || !user.lastName || !user.email) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please complete your account information before purchasing',
          requiredFields: ['firstName', 'lastName', 'email']
        }
      });
    }

    // Create or retrieve Stripe customer
    let customer;
    if (user.stripeCustomerId) {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      customer = await createOrRetrieveCustomer(user.email, null, {
        userId: userId,
        firstName: user.firstName,
        lastName: user.lastName
      });
      // Save Stripe customer ID to user
      user.stripeCustomerId = customer.id;
      user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
      await user.save();
    }

    // Create checkout session
    const session = await createCheckoutSession(
      customer.id,
      plan,
      successUrl,
      cancelUrl
    );

    // Store checkout session ID for later reference
    user.stripeCheckoutSessionId = session.id;
    await user.save();

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to create checkout session' }
    });
  }
});

/**
 * GET /api/v1/subscriptions/user/current
 * Get current user's active subscription
 */
router.get('/user/current', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user to check subscription status
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    // If no subscription, return free tier info
    if (!user.subscriptionId || user.subscriptionStatus === 'none') {
      return res.json({
        success: true,
        data: {
          plan: 'free',
          status: 'active',
          hasSubscription: false,
          message: 'You are on the free tier'
        }
      });
    }

    // Get subscription from database
    const subscription = await Subscription.findOne({
      userId,
      stripeSubscriptionId: user.subscriptionId
    });

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          plan: user.subscriptionPlan || 'free',
          status: user.subscriptionStatus || 'none',
          hasSubscription: user.subscriptionStatus === 'active'
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        amount: subscription.amount,
        currency: subscription.currency,
        billingEnvironment: subscription.billingEnvironment,
        canceledAt: subscription.canceledAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      }
    });

  } catch (error) {
    console.error('Error fetching user subscription:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch subscription' }
    });
  }
});

/**
 * GET /api/v1/subscriptions/user/all
 * Get all subscriptions for authenticated user
 */
router.get('/user/all', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscriptions = await Subscription.find({ userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        subscriptions,
        count: subscriptions.length
      }
    });

  } catch (error) {
    console.error('Error retrieving user subscriptions:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to retrieve subscriptions' }
    });
  }
});

/**
 * POST /api/v1/subscriptions/:subscriptionId/update-plan
 * Update subscription plan (upgrade/downgrade)
 */
router.post('/:subscriptionId/update-plan', auth, [
  param('subscriptionId').isString().notEmpty(),
  body('plan').isIn(['1-month', '3-month', '6-month', '12-month'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: errors.array() }
      });
    }

    const { subscriptionId } = req.params;
    const { plan } = req.body;
    const userId = req.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subscription not found' }
      });
    }

    // Update in Stripe
    const updatedStripeSubscription = await updateSubscription(subscriptionId, { plan });

    // Update in database
    subscription.plan = plan;
    subscription.stripePriceId = PRICE_IDS[plan];
    subscription.amount = PLAN_PRICING[plan].amount;
    subscription.currentPeriodStart = new Date(updatedStripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(updatedStripeSubscription.current_period_end * 1000);
    subscription.status = updatedStripeSubscription.status;
    subscription.updatedAt = new Date();
    await subscription.save();

    // Update user record
    const user = await User.findById(userId);
    user.subscriptionPlan = plan;
    user.subscriptionStatus = updatedStripeSubscription.status;
    user.subscriptionEndDate = new Date(updatedStripeSubscription.current_period_end * 1000);
    await user.save();

    res.json({
      success: true,
      data: {
        subscription,
        message: `Subscription updated to ${plan} plan`
      }
    });

  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to update subscription plan' }
    });
  }
});

/**
 * DELETE /api/v1/subscriptions/:subscriptionId/cancel
 * Cancel a subscription
 */
router.delete('/:subscriptionId/cancel', auth, [
  param('subscriptionId').isString().notEmpty(),
  body('atPeriodEnd').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: errors.array() }
      });
    }

    const { subscriptionId } = req.params;
    const { atPeriodEnd = false } = req.body;
    const userId = req.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subscription not found' }
      });
    }

    // Cancel in Stripe
    const canceledSubscription = await cancelSubscription(subscriptionId, atPeriodEnd);

    // Update in database
    subscription.status = canceledSubscription.status;
    subscription.canceledAt = new Date();
    subscription.cancelAtPeriodEnd = atPeriodEnd;
    subscription.updatedAt = new Date();
    await subscription.save();

    // Update user record
    const user = await User.findById(userId);
    if (!atPeriodEnd) {
      user.subscriptionStatus = 'canceled';
      user.subscriptionId = null;
    } else {
      user.subscriptionStatus = 'cancel_pending';
    }
    await user.save();

    res.json({
      success: true,
      data: {
        subscription,
        message: atPeriodEnd
          ? 'Subscription will be canceled at the end of the billing period'
          : 'Subscription has been canceled immediately'
      }
    });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to cancel subscription' }
    });
  }
});

/**
 * POST /api/v1/subscriptions/:subscriptionId/resume
 * Resume a canceled subscription
 */
router.post('/:subscriptionId/resume', auth, [
  param('subscriptionId').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: errors.array() }
      });
    }

    const { subscriptionId } = req.params;
    const userId = req.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subscription not found' }
      });
    }

    // Resume in Stripe
    const resumedSubscription = await resumeSubscription(subscriptionId);

    // Update in database
    subscription.status = resumedSubscription.status;
    subscription.canceledAt = null;
    subscription.cancelAtPeriodEnd = false;
    subscription.updatedAt = new Date();
    await subscription.save();

    // Update user record
    const user = await User.findById(userId);
    user.subscriptionStatus = 'active';
    user.subscriptionId = subscriptionId;
    await user.save();

    res.json({
      success: true,
      data: {
        subscription,
        message: 'Subscription has been resumed'
      }
    });

  } catch (error) {
    console.error('Error resuming subscription:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to resume subscription' }
    });
  }
});

/**
 * GET /api/v1/subscriptions/:subscriptionId/invoices
 * Get invoices for authenticated user's subscription
 */
router.get('/:subscriptionId/invoices', auth, [
  param('subscriptionId').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: errors.array() }
      });
    }

    const { subscriptionId } = req.params;
    const userId = req.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subscription not found' }
      });
    }

    const invoices = await getSubscriptionInvoices(subscriptionId);

    res.json({
      success: true,
      data: {
        invoices,
        count: invoices.length
      }
    });

  } catch (error) {
    console.error('Error retrieving invoices:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to retrieve invoices' }
    });
  }
});

module.exports = router;
