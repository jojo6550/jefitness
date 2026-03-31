const express = require('express');

const router = express.Router();
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { requireDbConnection } = require('../middleware/dbConnection');
const { authLimiter, signupLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/inputValidator');

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 */
router.post(
  '/signup',
  requireDbConnection,
  signupLimiter,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 chars'),
    handleValidationErrors,
  ],
  authController.signup
);

// SECURITY FIX: Handle legacy /register calls → redirect to /signup (preserves POST/validation/rate limit)
router.post('/register', requireDbConnection, signupLimiter, (req, res) => {
  res.redirect(307, '/api/v1/auth/signup');
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 */
router.post(
  '/login',
  requireDbConnection,
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors,
  ],
  authController.login
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout authenticated user
 *     tags: [Authentication]
 */
router.post('/logout', auth, authController.logout);

/**
 * @swagger
 * /api/v1/auth/consent:
 *   post:
 *     summary: Grant data processing consent (auto-called for existing users missing consent)
 *     tags: [Authentication]
 */
router.post('/consent', auth, authController.grantConsent);

module.exports = router;
