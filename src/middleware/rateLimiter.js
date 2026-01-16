const rateLimit = require('express-rate-limit');

/**
 * SECURITY: Identity-aware rate limit key generator
 * Prefers userId > email > IP for better protection against distributed attacks
 */
const identityAwareKeyGenerator = (req) => {
    // SECURITY: Prefer authenticated user ID (most specific)
    if (req.user && req.user.id) {
        return `user:${req.user.id}`;
    }
    
    // SECURITY: For auth routes, use email if provided (prevents username enumeration via IP rotation)
    if (req.body && req.body.email) {
        return `email:${req.body.email.toLowerCase()}`;
    }
    
    // SECURITY: Fallback to IP address
    return `ip:${req.ip}`;
};

/**
 * SECURITY: Stricter identity-aware limiter for authentication routes
 * Prevents brute force attacks even with rotating IPs
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each identity to 10 auth attempts per 15 minutes
    keyGenerator: identityAwareKeyGenerator,
    message: {
        msg: 'Too many authentication attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // SECURITY: Log rate limit violations for security monitoring
    handler: (req, res, next, options) => {
        const identifier = identityAwareKeyGenerator(req);
        console.warn(`Security event: auth_rate_limit_exceeded | Identifier: ${identifier} | IP: ${req.ip} | Path: ${req.path}`);
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * SECURITY: Identity-aware limiter for password reset requests
 * Prevents password reset abuse and enumeration attacks
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each identity to 3 password reset requests per hour
    keyGenerator: identityAwareKeyGenerator,
    message: {
        msg: 'Too many password reset requests. Please try again later.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        const identifier = identityAwareKeyGenerator(req);
        console.warn(`Security event: password_reset_rate_limit_exceeded | Identifier: ${identifier} | IP: ${req.ip}`);
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * SECURITY: Identity-aware limiter for checkout/payment routes
 * Prevents payment fraud and abuse
 */
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each identity to 10 checkout attempts per 15 minutes
    keyGenerator: identityAwareKeyGenerator,
    message: {
        msg: 'Too many checkout attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (req, res, next, options) => {
        const identifier = identityAwareKeyGenerator(req);
        console.warn(`Security event: checkout_rate_limit_exceeded | Identifier: ${identifier} | IP: ${req.ip}`);
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * SECURITY: Identity-aware general API rate limiter
 * Protects against general API abuse
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each identity to 100 requests per 15 minutes
    keyGenerator: identityAwareKeyGenerator,
    message: {
        msg: 'Too many requests. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * SECURITY: Stricter limiter for admin routes
 * Provides additional protection for sensitive admin operations
 */
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each identity to 50 admin requests per 15 minutes
    keyGenerator: identityAwareKeyGenerator,
    message: {
        msg: 'Too many admin requests. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        const identifier = identityAwareKeyGenerator(req);
        console.warn(`Security event: admin_rate_limit_exceeded | Identifier: ${identifier} | IP: ${req.ip} | Path: ${req.path}`);
        res.status(options.statusCode).json(options.message);
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    passwordResetLimiter,
    checkoutLimiter,
    adminLimiter
};