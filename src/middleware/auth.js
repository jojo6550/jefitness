// middleware/auth.js
const jwt = require('jsonwebtoken');
const { logger } = require('../services/logger');

function auth(req, res, next) {
    const authHeader = req.header('Authorization');
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
    } else {
        token = req.header('x-auth-token'); // Fallback
    }

    if (!token) {
        logger.warn('Authentication failed: No token provided', { ip: req.ip, userAgent: req.get('User-Agent') });
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            logger.error('Server configuration error: JWT_SECRET is not defined in environment variables');
            return res.status(500).json({ msg: 'Server configuration error: JWT secret missing.' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        logger.warn('Authentication failed: Token verification failed', {
            error: err.message,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ msg: 'Token is not valid' });
    }
}

module.exports = auth;
