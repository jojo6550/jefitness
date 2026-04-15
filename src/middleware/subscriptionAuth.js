/**
 * Middleware to enforce active subscription requirements
 * Single sub doc per user with states: active, cancelled, trialing
 */

const Subscription = require('../models/Subscription');
const { logger } = require('../services/logger');

/**
 * requireActiveSubscription - DB-only check for 1:1 model
 * Active if: status !== 'cancelled' && effectiveEnd >= now
 */
async function requireActiveSubscription(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        },
      });
    }

    const subscription = await Subscription.findOne({ userId: req.user.id });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Active subscription required.',
          details: { currentStatus: 'none' },
          action: { type: 'PURCHASE_SUBSCRIPTION', url: '/subscriptions' },
        },
      });
    }

    const effectiveEnd = subscription.overrideEndDate || subscription.currentPeriodEnd;
    const isActive = subscription.status !== 'cancelled' && effectiveEnd >= new Date();

    if (!isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Active subscription required.',
          details: {
            currentStatus: subscription.status,
            isExpired: effectiveEnd < new Date(),
            expiryDate: effectiveEnd,
          },
          action: { type: 'PURCHASE_SUBSCRIPTION', url: '/subscriptions' },
        },
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    logger.error('Error in requireActiveSubscription:', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Subscription verification failed',
      },
    });
  }
}

/**
 * optionalSubscriptionCheck - non-blocking
 */
async function optionalSubscriptionCheck(req, res, next) {
  try {
    if (req.user && req.user.id) {
      const subscription = await Subscription.findOne({ userId: req.user.id });
      req.subscriptionInfo = subscription && subscription.status !== 'cancelled' 
        ? {
            hasSubscription: true,
            plan: subscription.plan,
            expiresAt: subscription.overrideEndDate || subscription.currentPeriodEnd,
            status: subscription.status,
          }
        : { hasSubscription: false, plan: null, expiresAt: null };
    }
    next();
  } catch (error) {
    logger.error('Error in optionalSubscriptionCheck:', { error: error.message });
    next();
  }
}

module.exports = {
  requireActiveSubscription,
  optionalSubscriptionCheck,
};

