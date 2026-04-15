/**
 * State-driven subscription middleware - REFACTORED
 * Uses subscriptionService for deterministic checks
 * Auto-handles expiration on every request
 */

const subscriptionService = require('../services/subscriptionService');
const { logger } = require('../services/logger');

/**
 * requireActiveSubscription - Centralized access control
 * 1. getOrCreateSubscription()
 * 2. checkAndHandleExpiration()
 * 3. hasActiveAccess() → 403 if false
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

    const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
    await subscriptionService.checkAndHandleExpiration(subscription);

    if (!subscriptionService.hasActiveAccess(subscription)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Active subscription required.',
          details: {
            state: subscription.state,
            currentPeriodEnd: subscription.currentPeriodEnd,
            now: new Date().toISOString(),
          },
          action: { type: 'PURCHASE_SUBSCRIPTION', url: '/pages/subscriptions.html' },
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
 * optionalSubscriptionCheck - Non-blocking info only
 */
async function optionalSubscriptionCheck(req, res, next) {
  try {
    if (req.user && req.user.id) {
      const subscription = await subscriptionService.getOrCreateSubscription(req.user.id);
      await subscriptionService.checkAndHandleExpiration(subscription);
      
      req.subscriptionInfo = subscriptionService.hasActiveAccess(subscription)
        ? {
            hasSubscription: true,
            state: subscription.state,
            expiresAt: subscription.currentPeriodEnd,
          }
        : { 
            hasSubscription: false, 
            state: subscription.state,
            expiresAt: subscription.currentPeriodEnd 
          };
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

