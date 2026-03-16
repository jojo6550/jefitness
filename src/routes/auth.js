const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/inputValidator');

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 */
router.post('/signup', 
    [
        body('firstName').trim().notEmpty().withMessage('First name is required'),
        body('lastName').trim().notEmpty().withMessage('Last name is required'),
        body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
        handleValidationErrors
    ],
    authController.signup
);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 */
router.post('/login', 
    authLimiter, 
    [
        body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
        body('password').notEmpty().withMessage('Password is required'),
        handleValidationErrors
    ],
    authController.login
);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Verify email with OTP
 *     tags: [Authentication]
 */
router.post('/verify-email', 
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits'),
    handleValidationErrors
  ],
  authController.verifyEmail
);

/**
 * @swagger
 * /api/v1/auth/resend-otp:
 *   post:
 *     summary: Resend verification OTP
 *     tags: [Authentication]
 */
router.post('/resend-otp', 
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    handleValidationErrors
  ],
  authController.resendOtp
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

/**
 * @swagger
 * /api/v1/auth/email-status/{messageId}:
 *   get:
 *     summary: Check email delivery status (for debugging)
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/email-status/:messageId', authController.getEmailStatus);

module.exports = router;


