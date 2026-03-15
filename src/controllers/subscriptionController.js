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
    console.log('[CHECKOUT] Request body:', req.body);
    console.log('[CHECKOUT] User ID:', req.user?.id);
    const { planId } = req.body;

    // Fetch user to get/create their Stripe customer ID
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Create or retrieve Stripe customer if not already linked
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripeService.createOrRetrieveCustomer(
        user.email,
        null,
        { userId: user._id.toString() }
      );
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Build redirect URLs from the current request origin
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/subscriptions?canceled=true`;

    try {
      const session = await stripeService.createCheckoutSession(
      stripeCustomerId,
      planId,
      successUrl,
      cancelUrl
    );

      res.json({ success: true, data: { sessionId: session.id, url: session.url } });
    } catch (error) {
      console.error('[CHECKOUT ERROR]', {
        planId: req.body.planId,
        userId: req.user?.id,
        userEmail: req.user?.email,
        error: error.message,
        stack: error.stack
      });
      throw error; // Re-throw for asyncHandler
    }
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
