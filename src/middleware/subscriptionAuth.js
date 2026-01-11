/**
 * Middleware to enforce active subscription requirements
 * Protects routes that require a valid, active subscription
 */

const User = require('../models/User');

/**
 * Middleware: requireActiveSubscription
 * Checks if the authenticated user has an active subscription
 * Blocks access if subscription is inactive, expired, or not present
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {Object} 403 Forbidden if no active subscription
 */
async function requireActiveSubscription(req, res, next) {
    try {
        // Ensure user is authenticated (should be called after auth middleware)
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication required'
                }
            });
        }

        // Fetch user from database to get latest subscription status
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        // Check if user has an active subscription using the model method
        if (!user.hasActiveSubscription()) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'SUBSCRIPTION_REQUIRED',
                    message: 'You need an active subscription to access this feature.',
                    details: {
                        currentStatus: user.subscriptionStatus,
                        hasExpired: user.currentPeriodEnd ? new Date() > user.currentPeriodEnd : false,
                        expiryDate: user.currentPeriodEnd
                    },
                    action: {
                        type: 'PURCHASE_SUBSCRIPTION',
                        url: '/subscriptions.html'
                    }
                }
            });
        }

        // User has active subscription, proceed
        next();
    } catch (error) {
        console.error('Error in requireActiveSubscription middleware:', error);
        return res.status(500).json({
            success: false,
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to verify subscription status'
            }
        });
    }
}

/**
 * Middleware: optionalSubscriptionCheck
 * Adds subscription info to request without blocking access
 * Useful for routes that want to know subscription status but don't require it
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function optionalSubscriptionCheck(req, res, next) {
    try {
        if (req.user && req.user.id) {
            const user = await User.findById(req.user.id);
            if (user) {
                req.subscriptionInfo = user.getSubscriptionInfo();
            }
        }
        next();
    } catch (error) {
        console.error('Error in optionalSubscriptionCheck middleware:', error);
        // Don't block request on error, just proceed without subscription info
        next();
    }
}

module.exports = {
    requireActiveSubscription,
    optionalSubscriptionCheck
};