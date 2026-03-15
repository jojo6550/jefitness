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
    const { planId } = req.body;
    const session = await stripeService.createCheckoutSession(req.user.id, planId);
    res.json({ success: true, data: { sessionId: session.id, url: session.url } });
  }),

  /**
   * Get current user subscription
   */
  getCurrentSubscription: asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({ 
      userId: req.user.id,
      status: 'active'
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: subscription });
  }),

  /**
   * Cancel subscription
   */
  cancel: asyncHandler(async (req, res) => {
    const { subscriptionId } = req.params;
    const subscription = await Subscription.findOne({ 
      _id: subscriptionId, 
      userId: req.user.id 
    });

    if (!subscription) {
      throw new NotFoundError('Subscription not found');
    }

    await stripeService.cancelSubscription(subscription.stripeSubscriptionId);
    
    subscription.status = 'canceled';
    await subscription.save();

    res.json({ success: true, message: 'Subscription canceled' });
  })
};

module.exports = subscriptionController;
