// middleware/auth.js
const jwt = require('jsonwebtoken');
const { logSecurityEvent, logError } = require('../services/logger');

function auth(req, res, next) {
    const authHeader = req.header('Authorization');
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
    } else {
        token = req.header('x-auth-token'); // Fallback
    }

    if (!token) {
        logSecurityEvent('auth_failed', null, { reason: 'No token provided', ip: req.ip, userAgent: req.get('User-Agent') });
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Validate token format before attempting to verify
    if (typeof token !== 'string' || token.split('.').length !== 3) {
        logSecurityEvent('auth_failed', null, { reason: 'Malformed token format', ip: req.ip, userAgent: req.get('User-Agent') });
        return res.status(401).json({ msg: 'Token format is invalid' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            logError(new Error('JWT_SECRET environment variable is not defined'), { context: 'Auth Middleware Configuration' });
            return res.status(500).json({ msg: 'Server configuration error: JWT secret missing.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Log successful authentication
        logSecurityEvent('auth_success', decoded.id, {
            email: decoded.email || 'unknown',
            role: decoded.role,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        next();
    } catch (err) {
        // Log specific error types for better debugging
        let reason = 'Unknown error';
        if (err.name === 'JsonWebTokenError') {
            reason = 'Invalid token signature or format';
        } else if (err.name === 'TokenExpiredError') {
            reason = 'Token has expired';
        } else if (err.name === 'NotBeforeError') {
            reason = 'Token not active yet';
        } else {
            reason = err.message;
        }

        logSecurityEvent('auth_failed', null, {
            reason: reason,
            errorName: err.name,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        return res.status(401).json({ msg: 'Token is not valid' });
    }
}

module.exports = auth;
