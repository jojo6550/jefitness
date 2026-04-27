const Subscription = require('../models/Subscription');
const paypalService = require('../services/paypal');
const { PLANS } = require('../config/subscriptionConstants');
const { asyncHandler } = require('../middleware/errorHandler');
const { daysLeftUntil } = require('../utils/dateUtils');
const { logger } = require('../services/logger');

const subscriptionController = {
  getPlans: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        plans: Object.entries(PLANS).reduce((acc, [key, config]) => {
          acc[key] = {
            durationDays: config.durationDays,
            price: config.price,
            currency: config.currency,
          };
          return acc;
        }, {}),
      },
    });
  }),

  createCheckout: asyncHandler(async (req, res) => {
    const { plan } = req.body;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const planData = PLANS[plan];

    try {
      const paymentLink = await paypalService.createPaymentLink(plan, planData, req.user._id.toString());

      res.json({
        success: true,
        data: {
          orderId: paymentLink.orderId,
          approvalLink: paymentLink.approvalLink,
        },
      });
    } catch (error) {
      logger.error('Checkout creation failed', { plan, error: error.message });
      res.status(500).json({ error: 'Failed to create payment link' });
    }
  }),

  getCurrentSubscription: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
    }).select('-__v');

    if (!subscription) {
      return res.json({ success: true, data: null });
    }

    const daysLeft = daysLeftUntil(subscription.expiresAt);
    const isActive = subscription.active && subscription.expiresAt > new Date();

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        active: isActive,
        daysLeft: Math.max(0, daysLeft),
      },
    });
  }),

  verifyPayment: asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    try {
      const order = await paypalService.getOrderDetails(orderId);

      if (order.status !== 'APPROVED' && order.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'Payment not approved' });
      }

      let subscription = await Subscription.findOne({ userId: req.user._id });

      if (!subscription) {
        subscription = new Subscription({
          userId: req.user._id,
        });
      }

      const purchaseUnit = order.purchase_units?.[0];
      const planKey = order.purchase_units?.[0]?.description?.split(' - ')?.[0] || 'custom';
      const planData = PLANS[planKey] || PLANS['1-month'];

      subscription.paypalTransactionId = orderId;
      subscription.amount = parseFloat(purchaseUnit?.amount?.value || 0);
      subscription.currency = purchaseUnit?.amount?.currency_code || 'USD';
      subscription.purchasedAt = new Date();
      subscription.expiresAt = new Date(Date.now() + planData.durationDays * 24 * 60 * 60 * 1000);
      subscription.active = true;

      await subscription.save();

      res.json({
        success: true,
        data: {
          ...subscription.toObject(),
          daysLeft: planData.durationDays,
        },
      });
    } catch (error) {
      logger.error('Payment verification failed', { orderId, error: error.message });
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  }),

  cancel: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    subscription.active = false;
    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription cancelled',
    });
  }),
};

module.exports = subscriptionController;
