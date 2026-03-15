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
async function requireActiveSubscription(req, res, next) {
    try {
        // Ensure user is authenticated (must be called after auth middleware)
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication required'
                }
            });
        }

        // Query Subscription collection directly — source of truth mirrored from Stripe via webhooks
        const subscription = await Subscription.findOne({
            userId: req.user.id,
            status: 'active',
            currentPeriodEnd: { $gte: new Date() }
        }).sort({ currentPeriodEnd: -1 });

        if (!subscription) {
            // Try to find any subscription to provide better error context
            const anySubscription = await Subscription.findOne({ userId: req.user.id })
                .sort({ createdAt: -1 });

            return res.status(403).json({
                success: false,
                error: {
                    code: 'SUBSCRIPTION_REQUIRED',
                    message: 'You need an active subscription to access this feature.',
                    details: {
                        currentStatus: anySubscription ? anySubscription.status : 'none',
                        hasExpired: anySubscription
                            ? new Date() > new Date(anySubscription.currentPeriodEnd)
                            : false,
                        expiryDate: anySubscription ? anySubscription.currentPeriodEnd : null
                    },
                    action: {
                        type: 'PURCHASE_SUBSCRIPTION',
                        url: '/subscriptions'
                    }
                }
            });
        }

        // Attach subscription to request for downstream use
        req.subscription = subscription;
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
 * Attaches subscription info to req without blocking access.
 * Useful for routes that adapt behaviour based on subscription but don't require it.
 */
async function optionalSubscriptionCheck(req, res, next) {
    try {
        if (req.user && req.user.id) {
            const subscription = await Subscription.findOne({
                userId: req.user.id,
                status: 'active',
                currentPeriodEnd: { $gte: new Date() }
            }).sort({ currentPeriodEnd: -1 });

            req.subscriptionInfo = subscription
                ? {
                    hasSubscription: true,
                    plan: subscription.plan,
                    expiresAt: subscription.currentPeriodEnd,
                    status: subscription.status
                  }
                : { hasSubscription: false, plan: null, expiresAt: null };
        }
        next();
    } catch (error) {
        console.error('Error in optionalSubscriptionCheck middleware:', error);
        // Don't block the request on non-critical errors
        next();
    }
}

module.exports = {
    requireActiveSubscription,
    optionalSubscriptionCheck
};
