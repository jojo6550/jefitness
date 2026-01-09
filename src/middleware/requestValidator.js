/**
 * Request Validation Middleware
 * Validates incoming requests for security and correctness
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation result handler middleware
 * Should be used after validation middleware to check for errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = {};
    errors.array().forEach(error => {
      formattedErrors[error.param] = error.msg;
    });
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        errors: formattedErrors
      }
    });
  }
  next();
};

/**
 * Common validation rules
 */
const validationRules = {
  // Email validation
  email: () => body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  // Password validation - minimum 8 chars, must contain uppercase, lowercase, number
  password: () => body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and numbers'),

  // Confirm password match
  confirmPassword: () => body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),

  // User ID validation
  userId: () => param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),

  // Name validation
  name: (field = 'name') => body(field)
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage(`${field} must be between 2 and 100 characters`),

  // Phone number validation
  phone: () => body('phone')
    .matches(/^[\d\s\-\+\(\)]+$/)
    .isLength({ min: 10, max: 20 })
    .withMessage('Please provide a valid phone number'),

  // URL validation
  url: (field = 'url') => body(field)
    .isURL()
    .withMessage(`${field} must be a valid URL`),

  // Number validation
  number: (field = 'number', min = 0, max = 999999) => body(field)
    .isNumeric()
    .custom(value => value >= min && value <= max)
    .withMessage(`${field} must be a number between ${min} and ${max}`),

  // Date validation
  date: (field = 'date') => body(field)
    .isISO8601()
    .withMessage(`${field} must be a valid date`),

  // Pagination
  page: () => query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  limit: () => query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  // Search query validation
  search: () => query('search')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search query must not exceed 200 characters'),

  // Filter validation
  filter: (allowedValues = []) => query('filter')
    .optional()
    .isIn(allowedValues)
    .withMessage(`Filter must be one of: ${allowedValues.join(', ')}`)
};

module.exports = {
  handleValidationErrors,
  validationRules
};
