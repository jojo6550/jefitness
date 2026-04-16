/**
 * Middleware to enforce active subscription requirements
 * Protects routes that require a valid, active subscription
 * Stripe is the source of truth — status is verified from the Subscription collection (DB mirror of Stripe)
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
      status: 'active',
    });

    if (!subscription) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    if (subscription.currentPeriodEnd < new Date()) {
      return res.status(403).json({ error: 'Subscription expired' });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireActiveSubscription };
