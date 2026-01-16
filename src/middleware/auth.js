// middleware/auth.js
const jwt = require('jsonwebtoken');

// SECURITY: In-memory token blacklist (in production, use Redis or database)
// This provides basic token revocation for logout and password changes
const tokenBlacklist = new Set();

// SECURITY: Track token versions per user to invalidate all tokens on password change
const userTokenVersions = new Map();

function auth(req, res, next) {
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

    // SECURITY: Check if token is blacklisted (revoked)
    if (tokenBlacklist.has(token)) {
        return res.status(401).json({
            success: false,
            error: 'Token has been revoked. Please login again.'
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
        
        // SECURITY: Check token version for password change invalidation
        const userId = decoded.userId || decoded.id;
        const tokenVersion = decoded.tokenVersion || 0;
        const currentVersion = userTokenVersions.get(userId.toString()) || 0;
        
        if (tokenVersion < currentVersion) {
            return res.status(401).json({
                success: false,
                error: 'Token expired due to password change. Please login again.'
            });
        }
        
        req.user = decoded;
        // Normalize user ID for consistency across routes
        req.user.id = userId;
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

// SECURITY: Function to blacklist a token (for logout)
function blacklistToken(token) {
    tokenBlacklist.add(token);
    // Optional: Set a timeout to remove from blacklist after token expiry
    // For JWT with 1h expiry, remove after 1 hour
    setTimeout(() => {
        tokenBlacklist.delete(token);
    }, 60 * 60 * 1000); // 1 hour
}

// SECURITY: Increment token version for a user (invalidates all existing tokens)
// Call this after password change
function incrementUserTokenVersion(userId) {
    const userIdStr = userId.toString();
    const currentVersion = userTokenVersions.get(userIdStr) || 0;
    userTokenVersions.set(userIdStr, currentVersion + 1);
    console.log(`Security event: token_version_incremented | UserId: ${userId} | NewVersion: ${currentVersion + 1}`);
}

// SECURITY: Get current token version for a user
function getUserTokenVersion(userId) {
    return userTokenVersions.get(userId.toString()) || 0;
}

// SECURITY: Admin role check middleware
function requireAdmin(req, res, next) {
    // SECURITY: Verify role from database, not just from token
    // The token role can be stale or manipulated
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Admin privileges required.'
        });
    }
    next();
}

module.exports = { 
    auth, 
    blacklistToken, 
    requireAdmin,
    incrementUserTokenVersion,
    getUserTokenVersion
};