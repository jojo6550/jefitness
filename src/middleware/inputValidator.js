/**
 * Input Validation Middleware
 * SECURITY: Prevents NoSQL injection and validates input types
 */

const { validationResult } = require('express-validator');

/**
 * SECURITY: Strip dangerous fields from request body that could lead to privilege escalation
 * These fields should NEVER be set by client input
 */
const dangerousFields = [
    'role',
    'isAdmin',
    'admin',
    'isEmailVerified',
    'emailVerificationToken',
    'resetToken',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'billingEnvironment',
    '__v',
    '_id',
    'createdAt',
    'updatedAt',
    'failedLoginAttempts',
    'lockoutUntil'
];

/**
 * SECURITY: Middleware to strip dangerous fields from request body
 */
const stripDangerousFields = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        dangerousFields.forEach(field => {
            if (req.body.hasOwnProperty(field)) {
                console.warn(`Security event: dangerous_field_stripped | Field: ${field} | UserId: ${req.user?.id || 'anonymous'} | IP: ${req.ip}`);
                delete req.body[field];
            }
        });
    }
    next();
};

/**
 * SECURITY: Prevent NoSQL injection by validating query operators
 * MongoDB operators like $ne, $gt, $where can be exploited
 */
const preventNoSQLInjection = (req, res, next) => {
    const checkForOperators = (obj, path = '') => {
        if (typeof obj !== 'object' || obj === null) {
            return null;
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                // SECURITY: Detect MongoDB operators
                if (key.startsWith('$')) {
                    return `NoSQL operator detected: ${key} at ${path}`;
                }
                
                // SECURITY: Recursively check nested objects
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const nestedCheck = checkForOperators(obj[key], `${path}.${key}`);
                    if (nestedCheck) return nestedCheck;
                }
            }
        }
        return null;
    };

    // Check request body
    if (req.body) {
        const bodyCheck = checkForOperators(req.body, 'body');
        if (bodyCheck) {
            console.warn(`Security event: nosql_injection_attempt | ${bodyCheck} | UserId: ${req.user?.id || 'anonymous'} | IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid request format'
            });
        }
    }

    // Check query parameters
    if (req.query) {
        const queryCheck = checkForOperators(req.query, 'query');
        if (queryCheck) {
            console.warn(`Security event: nosql_injection_attempt | ${queryCheck} | UserId: ${req.user?.id || 'anonymous'} | IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid query format'
            });
        }
    }

    next();
};

/**
 * SECURITY: Validate MongoDB ObjectId format
 */
const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (id && !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid ID format'
            });
        }
        next();
    };
};

/**
 * SECURITY: Validation result handler
 * Returns standardized error response for validation failures
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => ({
            field: err.path || err.param,
            message: err.msg
        }));
        
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            errors: errorMessages
        });
    }
    next();
};

/**
 * SECURITY: Limit request body size to prevent DoS
 * This is in addition to express.json({ limit: '10kb' })
 */
const limitRequestSize = (maxSize = 10240) => { // 10KB default
    return (req, res, next) => {
        if (req.body && JSON.stringify(req.body).length > maxSize) {
            return res.status(413).json({
                success: false,
                error: 'Request payload too large'
            });
        }
        next();
    };
};

module.exports = {
    stripDangerousFields,
    preventNoSQLInjection,
    validateObjectId,
    handleValidationErrors,
    limitRequestSize
};