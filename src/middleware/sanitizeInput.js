/**
 * Input Sanitization Middleware
 * Prevents XSS attacks by sanitizing user input
 */

const sanitizeHtml = require('sanitize-html');

/**
 * SECURITY: Sanitize input middleware
 * Removes potentially dangerous HTML and scripts from request data
 * Prevents XSS attacks
 */
const sanitizeInput = (req, res, next) => {
  try {
    // SECURITY: Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // SECURITY: Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      for (const key in req.query) {
        if (Object.prototype.hasOwnProperty.call(req.query, key)) {
          req.query[key] = sanitizeObject(req.query[key]);
        }
      }
    }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    // SECURITY: Log but continue processing to avoid breaking functionality
    next();
  }
};

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeValue(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }
  return sanitized;
}

/**
 * SECURITY: Sanitize individual values
 * Strips all HTML tags to prevent XSS
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    try {
      // SECURITY: Remove all HTML tags and scripts
      const sanitized = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard'
      }).trim();
      
      // SECURITY: Additional protection against script injection
      return sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } catch (error) {
      console.error('Sanitize error:', error);
      return value;
    }
  }
  return value;
}

/**
 * Sanitize specific fields - more aggressive
 */
const sanitizeStrict = (fields = []) => {
  return (req, res, next) => {
    try {
      fields.forEach(field => {
        if (req.body && req.body[field]) {
          req.body[field] = sanitizeHtml(req.body[field], {
            allowedTags: [],
            allowedAttributes: {}
          });
        }
      });
      next();
    } catch (error) {
      console.error('Strict sanitization error:', error);
      res.status(400).json({
        success: false,
        error: { message: 'Invalid input format' }
      });
    }
  };
};

module.exports = {
  sanitizeInput,
  sanitizeStrict,
  sanitizeValue,
  sanitizeObject
};
