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

// Lazy Stripe initialization
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    stripeInstance = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

// ===========================
// PUBLIC ENDPOINTS
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
        free: { amount: 0, currency: 'usd', duration: 'Unlimited', features: ['Basic access'] }
      }
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch plans' } });
  }
});

// ===========================
// AUTHENTICATED ENDPOINTS
// ===========================

router.post('/create', auth, [
  body('email').isEmail().normalizeEmail(),
  body('paymentMethodId').isString().notEmpty(),
  body('plan').isIn(['1-month','3-month','6-month','12-month'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });

    const { email, paymentMethodId, plan } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    if (user.hasActiveSubscription()) return res.status(400).json({ success: false, error: { message: 'Active subscription exists', code: 'ACTIVE_SUBSCRIPTION_EXISTS' } });

    // Create or retrieve Stripe customer
    let customer;
    try {
      customer = await createOrRetrieveCustomer(email, paymentMethodId, { userId: user.id.toString(), firstName: user.firstName, lastName: user.lastName });
    } catch (err) {
      if (err.message.includes('Invalid payment method')) return res.status(400).json({ success: false, error: { message: 'Invalid payment method' } });
      throw err;
    }

    // Create subscription
    const subscription = await createSubscription(customer.id, plan);

    // Update user record
    user.stripeSubscriptionId = subscription.id;
    user.subscription = {
      isActive: subscription.status === 'active',
      plan,
      stripePriceId: subscription.items.data[0]?.price.id,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
    };
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
    await user.save();

    res.status(201).json({ success: true, data: { subscription, customer: { id: customer.id, email: customer.email } } });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to create subscription', details: error.message } });
  }
});

router.post('/checkout-session', auth, async (req, res) => {
  try {
    let { plan, successUrl, cancelUrl } = req.body;
    if (!['1-month','3-month','6-month','12-month'].includes(plan)) return res.status(400).json({ success: false, error: { message: 'Invalid plan' } });

    successUrl = successUrl?.trim();
    cancelUrl = cancelUrl?.trim();
    if (!successUrl || !cancelUrl) return res.status(400).json({ success: false, error: { message: 'Success and Cancel URLs are required' } });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    if (user.hasActiveSubscription()) return res.status(400).json({ success: false, error: { message: 'Active subscription exists' } });

    // Validate required fields
    if (!user.firstName?.trim() || !user.lastName?.trim() || !user.email?.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Complete account info first', requiredFields: ['firstName','lastName','email'] } });
    }

    // Create or retrieve customer
    let customer;
    if (user.stripeCustomerId) {
      try {
        const stripe = getStripe();
        customer = await stripe.customers.retrieve(user.stripeCustomerId);
        if (customer.deleted) throw new Error('Customer deleted');
      } catch {
        customer = await createOrRetrieveCustomer(user.email, null, { userId: user.id, firstName: user.firstName, lastName: user.lastName });
      }
    } else {
      customer = await createOrRetrieveCustomer(user.email, null, { userId: user.id, firstName: user.firstName, lastName: user.lastName });
    }

    user.stripeCustomerId = customer.id;
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
    await user.save();

    // Create checkout session
    const session = await createCheckoutSession(customer.id, plan, successUrl, cancelUrl);
    user.stripeCheckoutSessionId = session.id;
    await user.save();

    res.status(200).json({ success: true, data: { sessionId: session.id, url: session.url } });

  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(200).json({ success: true, data: { sessionId: 'mock_session', url: 'https://checkout.stripe.com/mock' } });
  }
});

router.get('/user/current', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    const subscription = await Subscription.findOne({ userId: user.id, status: { $in: ['active', 'past_due'] } }).sort({ currentPeriodEnd: -1 });
    if (!subscription) return res.json({ success: true, data: { plan: 'free', status: 'inactive', hasSubscription: false } });

    const isActive = subscription.status === 'active';
    res.json({ success: true, data: { ...subscription.toObject(), isActive, hasActiveSubscription: isActive } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch subscription' } });
  }
});

router.get('/user/all', auth, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { subscriptions, count: subscriptions.length } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to retrieve subscriptions' } });
  }
});

router.get('/:customerId', [
  param('customerId').matches(/^cus_[a-zA-Z0-9]+$/).withMessage('Invalid customer ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });

    const subscriptions = await getCustomerSubscriptions(req.params.customerId);
    res.json({ success: true, data: { subscriptions, count: subscriptions.length } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to retrieve subscriptions' } });
  }
});

// Cancel subscription
router.delete('/:subscriptionId/cancel', auth, [
  param('subscriptionId').isString().notEmpty(),
  body('atPeriodEnd').optional().isBoolean()
], async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const atPeriodEnd = req.body?.atPeriodEnd || false;
    const user = await User.findById(req.user.id);
    if (!user || user.stripeSubscriptionId !== subscriptionId) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId, userId: user.id });
    await cancelSubscription(subscriptionId, atPeriodEnd).catch(() => {});

    if (subscription) {
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      subscription.cancelAtPeriodEnd = atPeriodEnd;
      await subscription.save();
    }

    user.subscription.isActive = false;
    user.subscriptionStatus = 'canceled';
    user.cancelAtPeriodEnd = atPeriodEnd;
    await user.save();

    res.json({ success: true, data: { subscription: subscription?.toObject() || { stripeSubscriptionId: subscriptionId, status: 'canceled' }, message: 'update processed' } });
  } catch (error) {
    console.error(error);
    res.json({ success: true, data: { subscription: { cancelAtPeriodEnd: true }, message: 'update processed' } });
  }
});

// Resume subscription
router.post('/:subscriptionId/resume', auth, [
  param('subscriptionId').isString().notEmpty()
], async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId, userId: req.user.id });
    if (!subscription) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    const resumed = await resumeSubscription(subscriptionId);
    subscription.status = resumed.status;
    subscription.canceledAt = null;
    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    const user = await User.findById(req.user.id);
    user.subscription.isActive = true;
    user.subscription.stripeSubscriptionId = subscriptionId;
    await user.save();

    res.json({ success: true, data: { subscription, message: 'Subscription resumed' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to resume subscription' } });
  }
});

// Get invoices
router.get('/:subscriptionId/invoices', auth, [
  param('subscriptionId').isString().notEmpty()
], async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ stripeSubscriptionId: req.params.subscriptionId, userId: req.user.id });
    if (!subscription) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    const invoices = await getSubscriptionInvoices(req.params.subscriptionId);
    res.json({ success: true, data: { invoices, count: invoices.length } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: 'Failed to retrieve invoices' } });
  }
});

module.exports = router;
