// middleware/auth.js
const jwt = require('jsonwebtoken');

// In-memory token blacklist (in production, use Redis or database)
const tokenBlacklist = new Set();

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

    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                msg: 'Server configuration error: JWT secret missing.'
            });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.user.id = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
}

// Function to blacklist a token
function blacklistToken(token) {
    tokenBlacklist.add(token);
    // Optional: Set a timeout to remove from blacklist after token expiry
    // For JWT with 1h expiry, remove after 1 hour
    setTimeout(() => {
        tokenBlacklist.delete(token);
    }, 60 * 60 * 1000); // 1 hour
}

module.exports = { auth, blacklistToken };
