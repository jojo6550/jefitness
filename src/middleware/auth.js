// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// SECURITY: In-memory processed events cache for webhook replay protection
// In production, use Redis with TTL
const processedWebhookEvents = new Set();

/**
 * SECURITY: Main authentication middleware
 * Validates JWT token and ensures it hasn't been revoked via token versioning
 */
async function auth(req, res, next) {
    const authHeader = req.header('Authorization');
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '').trim();
    } else {
        token = req.header('x-auth-token'); // Fallback
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.'
        });
    }

    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                msg: 'Server configuration error: JWT secret missing.'
            });
        }
        
        // SECURITY: Verify JWT signature and expiration
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // SECURITY: Validate token structure
        if (!decoded.id && !decoded.userId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token structure'
            });
        }
        
        const userId = decoded.userId || decoded.id;
        const tokenVersion = decoded.tokenVersion || 0;
        
        // SECURITY: Verify token version against database (restart-safe)
        // This replaces in-memory token versioning and provides true invalidation
        const user = await User.findById(userId).select('+tokenVersion');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found. Token invalid.'
            });
        }
        
        const currentVersion = user.tokenVersion || 0;
        
        // SECURITY: Reject tokens with outdated version (invalidated by password change/logout)
        if (tokenVersion < currentVersion) {
            console.warn(`Security event: outdated_token_rejected | UserId: ${userId} | TokenVersion: ${tokenVersion} | CurrentVersion: ${currentVersion}`);
            return res.status(401).json({
                success: false,
                error: 'Token has been revoked. Please login again.'
            });
        }
        
        req.user = decoded;
        // Normalize user ID for consistency across routes
        req.user.id = userId;
        req.user.role = user.role; // SECURITY: Always use fresh role from DB
        next();
    } catch (err) {
        // SECURITY: Don't leak error details about JWT internals
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token has expired'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
}

/**
 * SECURITY: Increment token version in database (invalidates all existing tokens)
 * This is restart-safe and works across multiple server instances
 * Call this after password change or security events requiring full logout
 */
async function incrementUserTokenVersion(userId) {
    try {
        const user = await User.findById(userId).select('+tokenVersion');
        if (!user) {
            console.error(`Failed to increment token version: User ${userId} not found`);
            return;
        }
        
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        
        console.log(`Security event: token_version_incremented | UserId: ${userId} | NewVersion: ${user.tokenVersion}`);
    } catch (err) {
        console.error(`Failed to increment token version for user ${userId}:`, err.message);
    }
}

/**
 * SECURITY: Get current token version for a user from database
 */
async function getUserTokenVersion(userId) {
    try {
        const user = await User.findById(userId).select('+tokenVersion');
        return user ? (user.tokenVersion || 0) : 0;
    } catch (err) {
        console.error(`Failed to get token version for user ${userId}:`, err.message);
        return 0;
    }
}

/**
 * SECURITY: Admin role verification middleware
 * CRITICAL: Always verify role from database, NEVER trust JWT claims alone
 * JWT claims can be stale if role was changed after token issuance
 */
async function requireAdmin(req, res, next) {
    try {
        // SECURITY: Fetch current role from database for authoritative check
        const user = await User.findById(req.user.id).select('role');

        if (!user) {
            console.warn(`Security event: admin_access_denied | Reason: user_not_found | UserId: ${req.user.id}`);
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // SECURITY: Verify role from database, not from potentially stale JWT
        if (user.role !== 'admin') {
            console.warn(`Security event: admin_access_denied | UserId: ${req.user.id} | Role: ${user.role}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        // Update req.user with fresh role from database
        req.user.role = user.role;
        next();
    } catch (err) {
        console.error('Admin verification error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify admin status'
        });
    }
}

/**
 * SECURITY: Trainer role verification middleware
 * CRITICAL: Always verify role from database, NEVER trust JWT claims alone
 * JWT claims can be stale if role was changed after token issuance
 */
async function requireTrainer(req, res, next) {
    try {
        // SECURITY: Fetch current role from database for authoritative check
        const user = await User.findById(req.user.id).select('role');

        if (!user) {
            console.warn(`Security event: trainer_access_denied | Reason: user_not_found | UserId: ${req.user.id}`);
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // SECURITY: Verify role from database, not from potentially stale JWT
        if (user.role !== 'trainer') {
            console.warn(`Security event: trainer_access_denied | UserId: ${req.user.id} | Role: ${user.role}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied. Trainer privileges required.'
            });
        }

        // Update req.user with fresh role from database
        req.user.role = user.role;
        next();
    } catch (err) {
        console.error('Trainer verification error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify trainer status'
        });
    }
}

/**
 * SECURITY: Helper to check if webhook event has been processed (replay protection)
 */
function isWebhookEventProcessed(eventId) {
    return processedWebhookEvents.has(eventId);
}

/**
 * SECURITY: Mark webhook event as processed
 */
function markWebhookEventProcessed(eventId) {
    processedWebhookEvents.add(eventId);
    
    // SECURITY: Auto-cleanup after 24 hours to prevent memory leak
    // In production, use Redis with TTL instead
    setTimeout(() => {
        processedWebhookEvents.delete(eventId);
    }, 24 * 60 * 60 * 1000);
}

module.exports = {
    auth,
    requireAdmin,
    requireTrainer,
    incrementUserTokenVersion,
    getUserTokenVersion,
    isWebhookEventProcessed,
    markWebhookEventProcessed
};
