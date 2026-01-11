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
// GET ENDPOINTS
// ===========================

/**
 * GET /api/v1/subscriptions/plans
 * Get all available subscription plans with pricing
 */
router.get('/plans', (req, res) => {
  try {
    res.json({
      success: true,
      data: PLAN_PRICING
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch plans'
      }
    });
  }
});

/**
 * GET /api/v1/subscriptions/user/:userId
 * Get all subscriptions for a logged-in user
 */
router.get('/user/:userId', auth, [
  param('userId').isMongoId()
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

    const { userId } = req.params;

    // Security: Ensure user can only access their own subscriptions
    if (req.user.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Unauthorized: Cannot access other user\'s subscriptions'
        }
      });
    }

    // Find user subscriptions in database
    const subscriptions = await Subscription.find({ userId }).populate('userId', 'email firstName lastName');

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
      error: {
        message: error.message || 'Failed to retrieve subscriptions'
      }
    });
  }
});

/**
 * GET /api/v1/subscriptions/stripe/:customerId
 * Get all subscriptions from Stripe for a customer
 */
router.get('/stripe/:customerId', [
  param('customerId').isString().notEmpty()
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

    const { customerId } = req.params;

    // Get customer subscriptions from Stripe
    const subscriptions = await getCustomerSubscriptions(customerId);

    res.json({
      success: true,
      data: {
        subscriptions,
        count: subscriptions.length
      }
    });
  } catch (error) {
    console.error('Error retrieving Stripe subscriptions:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to retrieve subscriptions'
      }
    });
  }
});

/**
 * GET /api/v1/subscriptions/:subscriptionId
 * Get a single subscription details
 */
router.get('/:subscriptionId', [
  param('subscriptionId').isString().notEmpty()
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

    const { subscriptionId } = req.params;

    // Try to get from database first
    let subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });

    // If not in database, fetch from Stripe
    if (!subscription) {
      const stripeSubscription = await getSubscription(subscriptionId);
      res.json({
        success: true,
        data: {
          subscription: stripeSubscription,
          source: 'stripe'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        subscription,
        source: 'database'
      }
    });
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to retrieve subscription'
      }
    });
  }
});

/**
 * GET /api/v1/subscriptions/:subscriptionId/invoices
 * Get invoices for a subscription
 */
router.get('/:subscriptionId/invoices', [
  param('subscriptionId').isString().notEmpty()
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

    const { subscriptionId } = req.params;
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
      error: {
        message: error.message || 'Failed to retrieve invoices'
      }
    });
  }
});

/**
 * GET /api/v1/subscriptions/:customerId/payment-methods
 * Get payment methods for a customer
 */
router.get('/customer/:customerId/payment-methods', [
  param('customerId').isString().notEmpty()
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

    const { customerId } = req.params;
    const paymentMethods = await getPaymentMethods(customerId);

    res.json({
      success: true,
      data: {
        paymentMethods,
        count: paymentMethods.length
      }
    });
  } catch (error) {
    console.error('Error retrieving payment methods:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to retrieve payment methods'
      }
    });
  }
});

// ===========================
// POST ENDPOINTS
// ===========================

/**
 * POST /api/v1/subscriptions/create
 * Create a new subscription
 */
router.post('/create', auth, [
  body('email').isEmail().normalizeEmail(),
  body('paymentMethodId').isString().notEmpty(),
  body('plan').isIn(['1-month', '3-month', '6-month', '12-month'])
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

    const { email, paymentMethodId, plan } = req.body;
    const userId = req.user.user.id;

    // Create or retrieve Stripe customer
    const customer = await createOrRetrieveCustomer(email, paymentMethodId, {
      userId: userId,
      source: 'subscription_creation'
    });

    // Create subscription in Stripe
    const stripeSubscription = await createSubscription(customer.id, plan);

    // Save to database
    const subscription = await Subscription.create({
      userId,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: stripeSubscription.id,
      plan,
      stripePriceId: PRICE_IDS[plan],
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      status: stripeSubscription.status,
      amount: PLAN_PRICING[plan].amount,
      paymentMethodId
    });

    res.status(201).json({
      success: true,
      data: {
        subscription,
        customer: {
          id: customer.id,
          email: customer.email
        }
      }
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create subscription'
      }
    });
  }
});

/**
 * POST /api/v1/subscriptions/checkout-session
 * Create a Stripe Checkout session for subscription
 */
router.post('/checkout-session', auth, [
  body('email').isEmail().normalizeEmail(),
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

    const { email, plan, successUrl, cancelUrl } = req.body;

    // Create or retrieve Stripe customer
    const customer = await createOrRetrieveCustomer(email, null, {
      email: email,
      source: 'checkout_session'
    });

    // Create checkout session
    const session = await createCheckoutSession(
      customer.id,
      plan,
      successUrl,
      cancelUrl
    );

    res.json({
      success: true,
      data: {
        session,
        sessionUrl: session.url
      }
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create checkout session'
      }
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
        error: {
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { subscriptionId } = req.params;
    const { plan } = req.body;
    const userId = req.user.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription not found'
        }
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
    await subscription.save();

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
      error: {
        message: error.message || 'Failed to update subscription plan'
      }
    });
  }
});

// ===========================
// DELETE/CANCEL ENDPOINTS
// ===========================

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
        error: {
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { subscriptionId } = req.params;
    const { atPeriodEnd = false } = req.body;
    const userId = req.user.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription not found'
        }
      });
    }

    // Cancel in Stripe
    const canceledSubscription = await cancelSubscription(subscriptionId, atPeriodEnd);

    // Update in database
    subscription.status = canceledSubscription.status;
    subscription.canceledAt = new Date();
    subscription.cancelAtPeriodEnd = atPeriodEnd;
    await subscription.save();

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
      error: {
        message: error.message || 'Failed to cancel subscription'
      }
    });
  }
});

/**
 * POST /api/v1/subscriptions/:subscriptionId/resume
 * Resume a subscription that was canceled
 */
router.post('/:subscriptionId/resume', auth, [
  param('subscriptionId').isString().notEmpty()
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

    const { subscriptionId } = req.params;
    const userId = req.user.user.id;

    // Verify user owns this subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription not found'
        }
      });
    }

    // Resume in Stripe
    const resumedSubscription = await resumeSubscription(subscriptionId);

    // Update in database
    subscription.status = resumedSubscription.status;
    subscription.canceledAt = null;
    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

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
      error: {
        message: error.message || 'Failed to resume subscription'
      }
    });
  }
});

module.exports = router;
