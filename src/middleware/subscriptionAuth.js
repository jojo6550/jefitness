/**
 * Middleware to enforce active subscription requirements
 * Protects routes that require a valid, active subscription
 */

const Subscription = require('../models/Subscription');

/**
 * Middleware: requireActiveSubscription
 * Checks if the authenticated user has an active, non-expired subscription record in MongoDB.
 * MongoDB is kept in sync with Stripe via webhooks, so this is a fast, DB-only check.
 *
 * @param {Object} req - Express request object (must have req.user set by auth middleware)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
      active: true,
      expiresAt: { $gt: new Date() },
    });

    if (!subscription) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireActiveSubscription };
