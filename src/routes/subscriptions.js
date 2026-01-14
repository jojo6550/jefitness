const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { createOrRetrieveCustomer, createSubscription, cancelSubscription, getPlanPricing, getSubscriptionInvoices, getStripe } = require('../services/stripe');

const router = express.Router();

/**
 * Calculate period end based on Stripe price recurring information
 * @param {string} priceId - Stripe price ID
 * @param {Date} startDate - Period start date
 * @returns {Promise<Date>} Calculated period end date
 */
async function calculatePeriodEnd(priceId, startDate = new Date()) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    const price = await stripe.prices.retrieve(priceId);
    if (!price.recurring) {
      throw new Error('Price is not recurring');
    }

    const { interval, interval_count } = price.recurring;

    // Calculate days based on interval
    let daysToAdd;
    if (interval === 'month') {
      daysToAdd = interval_count * 30; // Approximate months to days
    } else if (interval === 'year') {
      daysToAdd = interval_count * 365; // Years to days
    } else if (interval === 'week') {
      daysToAdd = interval_count * 7; // Weeks to days
    } else if (interval === 'day') {
      daysToAdd = interval_count; // Days
    } else {
      daysToAdd = 30; // Default fallback
    }

    return new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  } catch (error) {
    console.error('Error calculating period end:', error.message);
    // Fallback to 30 days if price lookup fails
    return new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

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
    // Find subscription with active, past_due, or paused status
    const subscription = await Subscription.findOne({ 
      userId: req.user.id, 
      status: { $in: ['active', 'past_due', 'paused'] }
    });
    
    if (!subscription) return res.json({ success: true, data: { hasActiveSubscription: false } });
    
    // Calculate days remaining
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    const daysLeft = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    
    // Return subscription data with calculated fields
    res.json({ 
      success: true, 
      data: { 
        hasActiveSubscription: true, 
        ...subscription.toObject(),
        daysLeft: daysLeft > 0 ? daysLeft : 0
      } 
    });
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

    // Update DB based on cancellation type
    if (atPeriodEnd) {
      // Cancel at period end - subscription remains active until end
      subscription.cancelAtPeriodEnd = true;
      subscription.status = 'active'; // Keep as active until period end
    } else {
      // Immediate cancellation
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      subscription.cancelAtPeriodEnd = false;
    }

    await subscription.save();

    res.json({
      success: true,
      data: {
        message: atPeriodEnd
          ? 'Subscription will end at the current period end date'
          : 'Subscription canceled successfully'
      }
    });
  } catch (err) {
    console.error('Cancel subscription failed:', err);

    // Handle specific error cases
    if (err.message.includes('already canceled') || err.message.includes('does not exist')) {
      // If subscription is already canceled, update DB to reflect this
      try {
        const subId = req.params.id;
        const subscription = await Subscription.findOne({ stripeSubscriptionId: subId, userId: req.user.id });
        if (subscription) {
          subscription.status = 'canceled';
          subscription.canceledAt = new Date();
          subscription.cancelAtPeriodEnd = false;
          await subscription.save();
        }
        return res.json({
          success: true,
          data: { message: 'Subscription was already canceled' }
        });
      } catch (dbErr) {
        console.error('Failed to update DB for already canceled subscription:', dbErr);
      }
    }

    res.status(500).json({ success: false, error: { message: err.message || 'Failed to cancel subscription' } });
  }
});

// ----------------------
// 5. GET /:id/invoices
// ----------------------
router.get('/:id/invoices', auth, async (req, res) => {
  try {
    const subId = req.params.id;

    // Verify subscription belongs to user
    const subscription = await Subscription.findOne({ stripeSubscriptionId: subId, userId: req.user.id });
    if (!subscription) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    // Get invoices from Stripe
    const invoices = await getSubscriptionInvoices(subId);

    // Format invoices for frontend
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount_paid: invoice.amount_paid,
      total: invoice.total,
      currency: invoice.currency,
      created: invoice.created,
      date: invoice.created ? new Date(invoice.created * 1000) : null,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url
    }));

    res.json({ success: true, data: formattedInvoices });
  } catch (err) {
    console.error('Failed to fetch invoices:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch invoices' } });
  }
});

module.exports = router;
