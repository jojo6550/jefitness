const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const {
  createOrRetrieveCustomer,
  createSubscription
} = require('../services/stripe');

const router = express.Router();

// ===========================
// CREATE SUBSCRIPTION (DIRECT)
// ===========================
router.post(
  '/create',
  auth,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('paymentMethodId')
      .isString()
      .notEmpty()
      .withMessage('Payment method ID is required'),
    body('plan')
      .isIn(['1-month', '3-month', '6-month', '12-month'])
      .withMessage('Invalid plan selected')
  ],
  async (req, res) => {
    try {
      // ----- 1. Validate Request -----
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, paymentMethodId, plan } = req.body;

      // ----- 2. Find User -----
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found' } });
      }

      // ----- 3. Check Existing Active Subscription -----
      const existing = await Subscription.exists({ userId: user._id, status: 'active' });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: { message: 'Active subscription already exists' }
        });
      }

      // ----- 4. Create or Retrieve Stripe Customer -----
      let customer;
      try {
        customer = await createOrRetrieveCustomer(email, paymentMethodId, {
          userId: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName
        });
      } catch (err) {
        console.error('Stripe customer creation failed:', err);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to create Stripe customer' }
        });
      }

      if (!customer || !customer.id) {
        return res.status(500).json({
          success: false,
          error: { message: 'Invalid Stripe customer returned' }
        });
      }

      // ----- 5. Create Stripe Subscription -----
      let stripeSub;
      try {
        stripeSub = await createSubscription(customer.id, plan);
      } catch (err) {
        console.error('Stripe subscription creation failed:', err);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to create Stripe subscription' }
        });
      }

      // Validate Stripe response
      const item = stripeSub?.items?.data?.[0];
      if (!stripeSub.id || !item?.price?.id || !item.price.unit_amount) {
        console.error('Incomplete subscription data from Stripe:', stripeSub);
        return res.status(500).json({
          success: false,
          error: { message: 'Incomplete subscription data from Stripe' }
        });
      }

      // ----- 6. Save Subscription in DB -----
      let subscription;
      try {
        subscription = await Subscription.create({
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
      } catch (err) {
        console.error('Failed to save subscription in DB:', err);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to save subscription' }
        });
      }

      // ----- 7. Return Success -----
      return res.status(201).json({
        success: true,
        data: { subscription }
      });

    } catch (err) {
      console.error('Unexpected error in subscription creation:', err);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to create subscription' }
      });
    }
  }
);

module.exports = router;
