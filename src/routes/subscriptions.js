const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const {
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  getSubscriptionInvoices,
  createCheckoutSession,
  cancelSubscription,
  resumeSubscription,
  getPlanPricing
} = require('../services/stripe');

const router = express.Router();

// ===========================
// PUBLIC: GET PLANS
// ===========================
router.get('/plans', async (req, res) => {
  try {
    const plansObject = await getPlanPricing();

    const plans = Object.entries(plansObject).map(([key, value]) => ({
      id: key,
      name: key.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      price: value.displayPrice,
      interval: value.duration.toLowerCase(),
      ...value
    }));

    res.json({
      success: true,
      data: {
        plans,
        free: {
          plan: 'free',
          price: 0,
          features: ['Basic access']
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch plans' } });
  }
});

// ===========================
// CREATE SUBSCRIPTION (DIRECT)
// ===========================
router.post(
  '/create',
  auth,
  [
    body('email').isEmail(),
    body('paymentMethodId').isString().notEmpty(),
    body('plan').isIn(['1-month', '3-month', '6-month', '12-month'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, paymentMethodId, plan } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found' } });
      }

      // 🔐 SINGLE SOURCE OF TRUTH
      const existing = await Subscription.exists({
        userId: user._id,
        status: 'active'
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: { message: 'Active subscription exists' }
        });
      }

      const customer = await createOrRetrieveCustomer(email, paymentMethodId, {
        userId: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName
      });

      const stripeSub = await createSubscription(customer.id, plan);
      const item = stripeSub.items.data[0];

      // ✅ CREATE DB RECORD (CRITICAL)
      const subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: stripeSub.id,
        plan,
        stripePriceId: item.price.id,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        status: stripeSub.status,
        amount: item.price.unit_amount,
        currency: item.price.currency,
        billingEnvironment: process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')
          ? 'test'
          : 'production'
      });

      res.status(201).json({
        success: true,
        data: {
          subscription
        }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to create subscription' }
      });
    }
  }
);

// ===========================
// CHECKOUT SESSION (REDIRECT)
// ===========================
router.post('/checkout-session', auth, async (req, res) => {
  try {
    const { plan, successUrl, cancelUrl } = req.body;

    if (!['1-month', '3-month', '6-month', '12-month'].includes(plan)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid plan' } });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    const active = await Subscription.exists({
      userId: user._id,
      status: 'active'
    });

    if (active) {
      return res.status(400).json({ success: false, error: { message: 'Active subscription exists' } });
    }

    const customer = await createOrRetrieveCustomer(user.email, null, {
      userId: user._id.toString()
    });

    const session = await createCheckoutSession(customer.id, plan, successUrl, cancelUrl);

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Checkout failed' } });
  }
});

// ===========================
// GET CURRENT SUBSCRIPTION
// ===========================
router.get('/user/current', auth, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user.id,
      status: { $in: ['active', 'past_due'] }
    }).sort({ currentPeriodEnd: -1 });

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          plan: 'free',
          status: 'free',
          isActive: false,
          hasSubscription: false,
          hasActiveSubscription: false,
          message: 'You are on the free tier'
        }
      });
    }

    res.json({
      success: true,
      data: {
        plan: subscription.plan,
        status: subscription.status,
        isActive: subscription.status === 'active',
        hasSubscription: true,
        hasActiveSubscription: subscription.status === 'active',
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to load subscription' } });
  }
});

// ===========================
// CANCEL SUBSCRIPTION
// ===========================
router.delete('/:subscriptionId/cancel', auth, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
      userId: req.user.id
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });
    }

    await cancelSubscription(subscriptionId, false);

    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    await subscription.save();

    res.json({
      success: true,
      data: { message: 'Subscription canceled' }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Cancel failed' } });
  }
});

module.exports = router;
