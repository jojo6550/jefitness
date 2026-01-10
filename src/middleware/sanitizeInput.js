/**
 * Input Sanitization Middleware
 * Prevents XSS attacks by sanitizing user input
 */

const sanitizeHtml = require('sanitize-html');

/**
 * Sanitize input middleware
 * Removes potentially dangerous HTML and scripts from request data
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Skip sanitizing URL parameters as they are typically safe and may contain IDs
    // if (req.params && typeof req.params === 'object') {
    //   req.params = sanitizeObject(req.params);
    // }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    // Continue processing instead of throwing 400
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
 * Sanitize individual values
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    try {
      // Remove potential XSS attacks
      return sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard'
      }).trim();
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
