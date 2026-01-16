/**
 * Input Validation Middleware
 * SECURITY: Prevents NoSQL injection and validates input types
 */

const { validationResult } = require('express-validator');

/**
 * SECURITY: Dangerous fields that could lead to privilege escalation
 * These fields should NEVER be set by client input
 */
const dangerousFields = [
    'role',
    'isAdmin',
    'admin',
    'isEmailVerified',
    'emailVerificationToken',
    'resetToken',
    'passwordResetToken',
    'resetExpires',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'billingEnvironment',
    '__v',
    '_id',
    'createdAt',
    'updatedAt',
    'failedLoginAttempts',
    'lockoutUntil',
    'tokenVersion', // SECURITY: Prevent manipulation of token version
    // 'password' removed - handled by allowOnlyFields for specific routes
    'auditLog', // SECURITY: Audit logs cannot be modified by users
    'dataSubjectRights' // SECURITY: GDPR rights must be processed through dedicated endpoints
];

/**
 * SECURITY: Middleware to strip dangerous fields from request body (blacklist approach)
 * Use this as defense-in-depth, prefer whitelist approaches where possible
 */
const stripDangerousFields = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        dangerousFields.forEach(field => {
            if (req.body.hasOwnProperty(field)) {
                console.warn(`Security event: dangerous_field_stripped | Field: ${field} | UserId: ${req.user?.id || 'anonymous'} | IP: ${ipKeyGenerator(req)} | Path: ${req.path}`);
                delete req.body[field];
            }
        });
    }
    next();
};

/**
 * SECURITY: Whitelist-based field filtering (preferred over blacklist)
 * Only allow explicitly specified fields to pass through
 * 
 * @param {Array<string>} allowedFields - Array of field names that are allowed
 * @param {boolean} strict - If true, reject requests with disallowed fields; if false, strip them
 * @returns {Function} Express middleware
 * 
 * @example
 * router.put('/profile', auth, allowOnlyFields(['firstName', 'lastName', 'phone'], true), ...)
 */
const allowOnlyFields = (allowedFields = [], strict = false) => {
    return (req, res, next) => {
        try {
            if (!req.body || typeof req.body !== 'object') {
                return next();
            }

            const receivedFields = Object.keys(req.body);
            const disallowedFields = receivedFields.filter(field => !allowedFields.includes(field));

            if (disallowedFields.length > 0) {
                if (strict) {
                    console.warn(`Security event: disallowed_fields_rejected | Fields: ${disallowedFields.join(', ')} | UserId: ${req.user?.id || 'anonymous'} | IP: ${ipKeyGenerator(req)} | Path: ${req.path}`);
                    return res.status(400).json({
                        success: false,
                        error: 'Request contains disallowed fields',
                        disallowedFields
                    });
                } else {
                    console.warn(`Security event: disallowed_fields_stripped | Fields: ${disallowedFields.join(', ')} | UserId: ${req.user?.id || 'anonymous'} | IP: ${ipKeyGenerator(req)} | Path: ${req.path}`);
                    disallowedFields.forEach(field => delete req.body[field]);
                }
            }

            next();
        } catch (err) {
            console.error(`Security middleware error in allowOnlyFields: ${err.message}`);
            return res.status(500).json({
                success: false,
                error: 'Internal server error during field validation'
            });
        }
    };
};

/**
 * SECURITY: Comprehensive NoSQL injection prevention
 * Blocks all MongoDB operators and dangerous query patterns
 * Protects against: $ne, $gt, $where, $expr, $regex, aggregation injection
 */
const preventNoSQLInjection = (req, res, next) => {
    // SECURITY: List of dangerous MongoDB operators that should never come from user input
    const dangerousOperators = [
        '$where', '$expr', '$function', '$accumulator', '$regex',
        '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
        '$or', '$and', '$not', '$nor', '$exists', '$type',
        '$mod', '$text', '$search', '$language', '$caseSensitive',
        '$diacriticSensitive', '$elemMatch', '$size', '$all',
        '$geoIntersects', '$geoWithin', '$near', '$nearSphere',
        '$maxDistance', '$minDistance', '$center', '$centerSphere',
        '$box', '$polygon', '$uniqueDocs'
    ];

    const checkForInjection = (obj, path = '', depth = 0) => {
        // SECURITY: Prevent deeply nested objects (DoS protection)
        if (depth > 10) {
            return 'Excessive nesting depth detected';
        }

        if (typeof obj !== 'object' || obj === null) {
            return null;
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                // SECURITY: Detect MongoDB operators
                if (key.startsWith('$')) {
                    return `NoSQL operator detected: ${key} at ${path}`;
                }

                // SECURITY: Check for dangerous operator values
                if (typeof obj[key] === 'string' && dangerousOperators.some(op => obj[key].includes(op))) {
                    return `Dangerous operator in value at ${path}.${key}`;
                }

                // SECURITY: Detect regex injection attempts
                if (obj[key] instanceof RegExp) {
                    return `RegExp object detected at ${path}.${key}`;
                }

                // SECURITY: Recursively check nested objects
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const nestedCheck = checkForInjection(obj[key], `${path}.${key}`, depth + 1);
                    if (nestedCheck) return nestedCheck;
                }
            }
        }
        return null;
    };

    // SECURITY: Check request body
    if (req.body) {
        const bodyCheck = checkForInjection(req.body, 'body');
        if (bodyCheck) {
            console.warn(`Security event: nosql_injection_attempt | ${bodyCheck} | UserId: ${req.user?.id || 'anonymous'} | IP: ${ipKeyGenerator(req)} | Path: ${req.path}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid request format'
            });
        }
    }

    // SECURITY: Check query parameters
    if (req.query) {
        const queryCheck = checkForInjection(req.query, 'query');
        if (queryCheck) {
            console.warn(`Security event: nosql_injection_attempt | ${queryCheck} | UserId: ${req.user?.id || 'anonymous'} | IP: ${req.ip} | Path: ${req.path}`);
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
 * SECURITY: Validate and sanitize sort parameters
 * Prevents NoSQL injection via sort parameters in queries
 */
const validateSortParam = (allowedFields = []) => {
    return (req, res, next) => {
        if (!req.query.sort) {
            return next();
        }

        const sortFields = req.query.sort.split(',');
        
        for (const field of sortFields) {
            const fieldName = field.replace(/^-/, ''); // Remove sort direction prefix
            
            // SECURITY: Check for MongoDB operators
            if (fieldName.includes('$')) {
                console.warn(`Security event: invalid_sort_field | Field: ${fieldName} | UserId: ${req.user?.id || 'anonymous'} | IP: ${ipKeyGenerator(req)} | Path: ${req.path}`);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid sort field'
                });
            }
            
            // SECURITY: Whitelist check if allowed fields specified
            if (allowedFields.length > 0 && !allowedFields.includes(fieldName)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid sort field: ${fieldName}`
                });
            }
        }
        
        next();
    };
};

/**
 * SECURITY: Sanitize aggregation pipeline stages
 * Only allow safe aggregation stages, block dangerous ones
 */
const validateAggregationPipeline = (pipeline) => {
    // SECURITY: Whitelist of safe aggregation stages
    const allowedStages = [
        '$match', '$project', '$sort', '$limit', '$skip',
        '$group', '$unwind', '$lookup', '$count'
    ];

    // SECURITY: Dangerous stages that allow code execution
    const dangerousStages = [
        '$where', '$function', '$accumulator', '$expr'
    ];

    if (!Array.isArray(pipeline)) {
        throw new Error('Pipeline must be an array');
    }

    for (const stage of pipeline) {
        if (typeof stage !== 'object') {
            throw new Error('Invalid pipeline stage');
        }

        const stageKeys = Object.keys(stage);
        
        for (const key of stageKeys) {
            // SECURITY: Block dangerous stages
            if (dangerousStages.includes(key)) {
                throw new Error(`Dangerous aggregation stage not allowed: ${key}`);
            }
            
            // SECURITY: Only allow whitelisted stages
            if (!allowedStages.includes(key)) {
                throw new Error(`Aggregation stage not allowed: ${key}`);
            }
        }
    }

    return true;
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
    allowOnlyFields,
    preventNoSQLInjection,
    validateObjectId,
    handleValidationErrors,
    limitRequestSize,
    validateSortParam,
    validateAggregationPipeline
};