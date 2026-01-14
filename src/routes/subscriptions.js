const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { createOrRetrieveCustomer, createSubscription, cancelSubscription, getPlanPricing } = require('../services/stripe');

const router = express.Router();

// ----------------------
// 1. GET /plans
// ----------------------
router.get('/plans', async (req, res) => {
  try {
    // Fetch dynamic pricing from Stripe
    const pricing = await getPlanPricing();
    
    // Convert pricing object to array format for the response
    const plans = Object.entries(pricing).map(([key, plan]) => ({
      id: key,
      name: plan.duration,
      amount: plan.amount,
      displayPrice: plan.displayPrice,
      savings: plan.savings || null,
      priceId: plan.priceId,
      productId: plan.productId
    }));

    res.json({ success: true, data: { plans } });
  } catch (err) {
    console.error('Failed to load plans:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to load plans' } });
  }
});

// ----------------------
// 2. GET /user/current
// ----------------------
router.get('/user/current', auth, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id, status: 'active' });
    if (!subscription) return res.json({ success: true, data: { hasActiveSubscription: false } });
    res.json({ success: true, data: { hasActiveSubscription: true, ...subscription.toObject() } });
  } catch (err) {
    console.error('Failed to fetch user subscription:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch subscription' } });
  }
});

// ----------------------
// 3. POST /create
// ----------------------
router.post(
  '/create',
  auth,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('paymentMethodId').isString().notEmpty().withMessage('Payment method ID is required'),
    body('plan').isIn(['1-month', '3-month', '6-month', '12-month']).withMessage('Invalid plan selected')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { email, paymentMethodId, plan } = req.body;
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

      const existing = await Subscription.exists({ userId: user._id, status: 'active' });
      if (existing) return res.status(400).json({ success: false, error: { message: 'Active subscription already exists' } });

      const customer = await createOrRetrieveCustomer(email, paymentMethodId, {
        userId: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName
      });

      const stripeSub = await createSubscription(customer.id, plan);
      const item = stripeSub?.items?.data?.[0];
      if (!stripeSub.id || !item?.price?.id || !item.price.unit_amount)
        return res.status(500).json({ success: false, error: { message: 'Incomplete subscription data from Stripe' } });

      let currentPeriodStart = stripeSub.current_period_start;
      let currentPeriodEnd = stripeSub.current_period_end;
      if (!currentPeriodStart || typeof currentPeriodStart !== 'number') {
        currentPeriodStart = Math.floor(Date.now() / 1000);
      }
      if (!currentPeriodEnd || typeof currentPeriodEnd !== 'number') {
        currentPeriodEnd = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
      }

      const subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: stripeSub.id,
        plan,
        stripePriceId: item.price.id,
        currentPeriodStart: new Date(currentPeriodStart * 1000),
        currentPeriodEnd: new Date(currentPeriodEnd * 1000),
        status: stripeSub.status,
        amount: item.price.unit_amount / 100,
        currency: item.price.currency,
        billingEnvironment: process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : 'production'
      });

      res.status(201).json({ success: true, data: { subscription } });
    } catch (err) {
      console.error('Subscription creation failed:', err);
      res.status(500).json({ success: false, error: { message: 'Failed to create subscription' } });
    }
  }
);

// ----------------------
// 4. DELETE /:id/cancel
// ----------------------
router.delete('/:id/cancel', auth, async (req, res) => {
  try {
    const subId = req.params.id;
    const { atPeriodEnd = false } = req.body;

    const subscription = await Subscription.findOne({ stripeSubscriptionId: subId, userId: req.user.id });
    if (!subscription) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    // Cancel via Stripe
    await cancelSubscription(subId, atPeriodEnd);

    // Update DB
    subscription.status = atPeriodEnd ? 'active' : 'canceled';
    subscription.canceledAt = new Date();
    await subscription.save();

    res.json({ success: true, data: { message: atPeriodEnd ? 'Subscription will end at period end' : 'Subscription canceled' } });
  } catch (err) {
    console.error('Cancel subscription failed:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to cancel subscription' } });
  }
});

module.exports = router;
