/**
 * SECURITY: Ownership Verification Middleware
 * Provides reusable IDOR (Insecure Direct Object Reference) protection
 * Ensures users can only access resources they own unless they have admin privileges
 */

const mongoose = require('mongoose');

/**
 * SECURITY: Verify resource ownership
 * Generic middleware to ensure user owns the resource or is an admin
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.getResourceId - Function to extract resource ID from request
 * @param {Function} options.getOwnerId - Async function to get owner ID from resource
 * @param {string} options.resourceName - Name of resource for error messages
 * @param {boolean} options.allowAdmin - Whether admins can access any resource (default: true)
 * @returns {Function} Express middleware
 * 
 * @example
 * // Protect user profile endpoint
 * router.get('/:id', auth, verifyOwnership({
 *   getResourceId: (req) => req.params.id,
 *   getOwnerId: async (resourceId) => resourceId, // For user resources, ID is owner ID
 *   resourceName: 'profile'
 * }), async (req, res) => { ... });
 * 
 * @example
 * // Protect subscription endpoint
 * router.get('/:subscriptionId', auth, verifyOwnership({
 *   getResourceId: (req) => req.params.subscriptionId,
 *   getOwnerId: async (subscriptionId) => {
 *     const subscription = await Subscription.findById(subscriptionId);
 *     return subscription ? subscription.userId.toString() : null;
 *   },
 *   resourceName: 'subscription'
 * }), async (req, res) => { ... });
 */
function verifyOwnership(options) {
    const {
        getResourceId,
        getOwnerId,
        resourceName = 'resource',
        allowAdmin = true
    } = options;

    return async (req, res, next) => {
        try {
            // SECURITY: Ensure user is authenticated
            if (!req.user || !req.user.id) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // SECURITY: Admins can access any resource if allowed
            if (allowAdmin && req.user.role === 'admin') {
                return next();
            }

            // Get resource ID from request
            const resourceId = getResourceId(req);
            
            if (!resourceId) {
                return res.status(400).json({
                    success: false,
                    error: 'Resource ID missing'
                });
            }

            // SECURITY: Validate ObjectId format to prevent injection
            if (typeof resourceId === 'string' && resourceId.length === 24) {
                if (!mongoose.Types.ObjectId.isValid(resourceId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid resource ID format'
                    });
                }
            }

            // Get owner ID of the resource
            const ownerId = await getOwnerId(resourceId, req);

            if (!ownerId) {
                return res.status(404).json({
                    success: false,
                    error: `${resourceName} not found`
                });
            }

            // SECURITY: Verify ownership - compare as strings to handle ObjectId vs string
            const ownerIdStr = ownerId.toString();
            const userIdStr = req.user.id.toString();

            if (ownerIdStr !== userIdStr) {
                console.warn(`Security event: idor_attempt_blocked | UserId: ${userIdStr} | OwnerId: ${ownerIdStr} | Resource: ${resourceName} | ResourceId: ${resourceId}`);
                return res.status(403).json({
                    success: false,
                    error: `Access denied. You can only access your own ${resourceName}.`
                });
            }

            // Ownership verified, proceed
            next();
        } catch (err) {
            console.error(`Ownership verification error for ${resourceName}:`, err.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to verify resource ownership'
            });
        }
    };
}

/**
 * SECURITY: Verify user can only modify their own profile
 * Specialized middleware for user profile endpoints
 */
const verifyUserOwnership = verifyOwnership({
    getResourceId: (req) => req.params.id,
    getOwnerId: async (userId) => userId, // For users, the resource ID is the owner ID
    resourceName: 'profile',
    allowAdmin: true
});

/**
 * SECURITY: Verify ownership for documents with userId field
 * Generic helper for Mongoose models with userId field
 */
function verifyModelOwnership(Model, resourceName, paramName = 'id') {
    return verifyOwnership({
        getResourceId: (req) => req.params[paramName],
        getOwnerId: async (resourceId) => {
            const resource = await Model.findById(resourceId).select('userId');
            return resource ? resource.userId : null;
        },
        resourceName,
        allowAdmin: true
    });
}

/**
 * SECURITY: Verify user owns a query result
 * For routes that query by userId in query string
 */
function verifyQueryOwnership(userIdField = 'userId') {
    return (req, res, next) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // SECURITY: Admins can query any user's data
            if (req.user.role === 'admin') {
                return next();
            }

            // SECURITY: Prevent users from querying other users' data
            if (req.query[userIdField] && req.query[userIdField] !== req.user.id.toString()) {
                console.warn(`Security event: idor_query_attempt | UserId: ${req.user.id} | RequestedUserId: ${req.query[userIdField]}`);
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. You can only access your own data.'
                });
            }

            // SECURITY: Force query to use authenticated user's ID
            req.query[userIdField] = req.user.id.toString();
            next();
        } catch (err) {
            console.error('Query ownership verification error:', err.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to verify ownership'
            });
        }
    };
}

module.exports = {
    verifyOwnership,
    verifyUserOwnership,
    verifyModelOwnership,
    verifyQueryOwnership
};