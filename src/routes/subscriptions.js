const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { preventNoSQLInjection, stripDangerousFields, handleValidationErrors, allowOnlyFields } = require('../middleware/inputValidator');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { createOrRetrieveCustomer, createSubscription, cancelSubscription, getPlanPricing, getSubscriptionInvoices, getStripe } = require('../services/stripe');
const { calculateSubscriptionEndDate } = require('../utils/dateUtils');

const router = express.Router();

// SECURITY: Apply input validation to all subscription routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

/**
 * Calculate period end based on Stripe price recurring information
 * Uses proper calendar arithmetic for accurate date calculations
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

    // Map Stripe interval to plan format
    let plan;
    if (interval === 'month') {
      plan = `${interval_count}-month`;
    } else if (interval === 'year') {
      plan = `${interval_count * 12}-month`; // Convert years to months
    } else {
      // For week/day intervals, fall back to approximate calculation
      let daysToAdd;
      if (interval === 'week') {
        daysToAdd = interval_count * 7;
      } else if (interval === 'day') {
        daysToAdd = interval_count;
      } else {
        daysToAdd = 30; // Default fallback
      }
      return new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    }

    // Use proper calendar calculation
    return calculateSubscriptionEndDate(plan, startDate);
  } catch (error) {
    console.error('Error calculating period end:', error.message);
    // Fallback to 30 days if price lookup fails
    return new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * @swagger
 * /api/v1/subscriptions/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: Plans retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     plans:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           displayPrice:
 *                             type: string
 *                           savings:
 *                             type: string
 *                             nullable: true
 *                           priceId:
 *                             type: string
 *                           productId:
 *                             type: string
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/v1/subscriptions/user/current:
 *   get:
 *     summary: Get current user's subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         hasActiveSubscription:
 *                           type: boolean
 *                           example: false
 *                     - type: object
 *                       properties:
 *                         hasActiveSubscription:
 *                           type: boolean
 *                           example: true
 *                         _id:
 *                           type: string
 *                         userId:
 *                           type: string
 *                         stripeCustomerId:
 *                           type: string
 *                         stripeSubscriptionId:
 *                           type: string
 *                         plan:
 *                           type: string
 *                         stripePriceId:
 *                           type: string
 *                         currentPeriodStart:
 *                           type: string
 *                           format: date-time
 *                         currentPeriodEnd:
 *                           type: string
 *                           format: date-time
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         billingEnvironment:
 *                           type: string
 *                         cancelAtPeriodEnd:
 *                           type: boolean
 *                         canceledAt:
 *                           type: string
 *                           format: date-time
 *                         daysLeft:
 *                           type: integer
 *       500:
 *         description: Server error
 */
router.get('/user/current', auth, async (req, res) => {
  try {
    // SECURITY: Only return subscription for authenticated user (IDOR protection)
    // Include 'canceled' status so users can see expired subscriptions and renew
    const subscription = await Subscription.findOne({ 
      userId: req.user.id, // IDOR protection
      status: { $in: ['active', 'past_due', 'paused', 'canceled'] }
    }).sort({ createdAt: -1 }); // Get most recent subscription
    
    if (!subscription) return res.json({ success: true, data: { hasActiveSubscription: false } });
    
    // Calculate days remaining
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    const daysLeft = Math.floor((periodEnd - now) / (1000 * 60 * 60 * 24));
    
    // Consider subscription "active" only if status is truly active and not expired
    const isActiveAndNotExpired = (subscription.status === 'active' || subscription.status === 'past_due' || subscription.status === 'paused') && daysLeft > 0;
    
    // Return subscription data with calculated fields
    res.json({ 
      success: true, 
      data: { 
        hasActiveSubscription: isActiveAndNotExpired, 
        ...subscription.toObject(),
        daysLeft: daysLeft > 0 ? daysLeft : 0
      } 
    });
  } catch (err) {
    console.error('Failed to fetch user subscription:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch subscription' } });
  }
});

/**
 * @swagger
 * /api/v1/subscriptions/create:
 *   post:
 *     summary: Create a new subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *               - plan
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: Stripe payment method ID
 *               plan:
 *                 type: string
 *                 enum: [1-month, 3-month, 6-month, 12-month]
 *                 description: Subscription plan
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         userId:
 *                           type: string
 *                         stripeCustomerId:
 *                           type: string
 *                         stripeSubscriptionId:
 *                           type: string
 *                         plan:
 *                           type: string
 *                         stripePriceId:
 *                           type: string
 *                         currentPeriodStart:
 *                           type: string
 *                           format: date-time
 *                         currentPeriodEnd:
 *                           type: string
 *                           format: date-time
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         billingEnvironment:
 *                           type: string
 *       400:
 *         description: Validation failed or active subscription exists
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post(
  '/create',
  auth,
  [
    body('paymentMethodId').isString().trim().notEmpty().withMessage('Payment method ID is required'),
    body('plan').isIn(['1-month', '3-month', '6-month', '12-month']).withMessage('Invalid plan selected')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      // SECURITY: Get authenticated user
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found' } });
      }

      const { paymentMethodId, plan } = req.body;

      // SECURITY: Check for existing active subscription
      const existing = await Subscription.exists({ 
        userId: user._id, 
        status: 'active' 
      });
      if (existing) return res.status(400).json({ success: false, error: { message: 'Active subscription already exists' } });

      // SECURITY: Use verified email from database, not from request
      const customer = await createOrRetrieveCustomer(user.email, paymentMethodId, {
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
        // Use plan-specific fallback instead of always 30 days
        const startDate = new Date(currentPeriodStart * 1000);
        let fallbackEndDate;
        if (plan === '1-month') fallbackEndDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        else if (plan === '3-month') fallbackEndDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
        else if (plan === '6-month') fallbackEndDate = new Date(startDate.getTime() + 180 * 24 * 60 * 60 * 1000);
        else if (plan === '12-month') fallbackEndDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        else fallbackEndDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        currentPeriodEnd = Math.floor(fallbackEndDate.getTime() / 1000);
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
// 4. DELETE /:id/cancel (IDOR Protected)
// ----------------------
router.delete('/:id/cancel', auth, allowOnlyFields(['atPeriodEnd'], false), async (req, res) => {
  try {
    const subId = req.params.id;
    const { atPeriodEnd = false } = req.body;

    // SECURITY: Verify subscription belongs to authenticated user (IDOR protection)
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: subId, 
      userId: req.user.id // IDOR protection
    });
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

/**
 * @swagger
 * /api/v1/subscriptions/{id}/invoices:
 *   get:
 *     summary: Get subscription invoices
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe subscription ID
 *     responses:
 *       200:
 *         description: Invoices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       number:
 *                         type: string
 *                       status:
 *                         type: string
 *                       amount_paid:
 *                         type: integer
 *                       total:
 *                         type: integer
 *                       currency:
 *                         type: string
 *                       created:
 *                         type: integer
 *                       date:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       invoice_pdf:
 *                         type: string
 *                       hosted_invoice_url:
 *                         type: string
 *       404:
 *         description: Subscription not found
 *       500:
 *         description: Server error
 */
router.get('/:id/invoices', auth, async (req, res) => {
  try {
    const subId = req.params.id;

    // SECURITY: Verify subscription belongs to authenticated user (IDOR protection)
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: subId, 
      userId: req.user.id // IDOR protection
    });
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



/**
 * @swagger
 * /api/v1/subscriptions/{id}/payment-method:
 *   get:
 *     summary: Get subscription payment method
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe subscription ID
 *     responses:
 *       200:
 *         description: Payment method retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       nullable: true
 *                       description: No payment method set
 *                     - type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         type:
 *                           type: string
 *                         card:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             brand:
 *                               type: string
 *                             last4:
 *                               type: string
 *                             exp_month:
 *                               type: integer
 *                             exp_year:
 *                               type: integer
 *       404:
 *         description: Subscription not found
 *       500:
 *         description: Server error
 */
router.get('/:id/payment-method', auth, async (req, res) => {
  try {
    const subId = req.params.id;

    // SECURITY: Verify subscription belongs to authenticated user (IDOR protection)
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subId,
      userId: req.user.id // IDOR protection
    });
    if (!subscription) return res.status(404).json({ success: false, error: { message: 'Subscription not found' } });

    // Get payment method from Stripe
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Get the subscription to find the default payment method
    const stripeSub = await stripe.subscriptions.retrieve(subId, {
      expand: ['default_payment_method']
    });

    if (!stripeSub.default_payment_method) {
      return res.json({ success: true, data: null });
    }

    // Get detailed payment method info
    const paymentMethod = await stripe.paymentMethods.retrieve(stripeSub.default_payment_method.id);

    // Return only card details (last 4 digits, brand, etc.)
    const cardData = paymentMethod.card ? {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      exp_month: paymentMethod.card.exp_month,
      exp_year: paymentMethod.card.exp_year
    } : null;

    res.json({
      success: true,
      data: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: cardData
      }
    });
  } catch (err) {
    console.error('Failed to fetch payment method:', err);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch payment method' } });
  }
});

module.exports = router;
