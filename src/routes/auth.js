const crypto = require('crypto');
const express = require('express');

const router = express.Router();
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');

const authController = require('../controllers/authController');
const { auth, incrementUserTokenVersion } = require('../middleware/auth');
const { requireDbConnection } = require('../middleware/dbConnection');
const { authLimiter, signupLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/inputValidator');
const User = require('../models/User');
const { sendPasswordReset, sendEmailVerification } = require('../services/email');
const { logger } = require('../services/logger');

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

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   get:
 *     summary: Verify email address using token from verification email
 *     tags: [Authentication]
 */
router.get('/verify-email', requireDbConnection, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token is required.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification token.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    logger.error('Email verification error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/auth/resend-verification:
 *   post:
 *     summary: Resend the email verification link
 *     tags: [Authentication]
 */
router.post(
  '/resend-verification',
  requireDbConnection,
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select(
        '+emailVerificationToken +emailVerificationExpires'
      );

      // Always return 200 to avoid email enumeration
      if (!user || user.isEmailVerified) {
        return res.json({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save({ validateBeforeSave: false });

      sendEmailVerification(user.email, user.firstName, rawToken).catch(err => {
        logger.error('Failed to resend verification email', { userId: user._id, error: err.message });
      });

      res.json({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' });
    } catch (err) {
      logger.error('Resend verification error', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Authentication]
 */
router.post(
  '/forgot-password',
  requireDbConnection,
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      // Always return 200 to avoid email enumeration
      if (!user) {
        return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
      }

      // Generate a raw token; store its SHA-256 hash in the DB
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save({ validateBeforeSave: false });

      try {
        await sendPasswordReset(user.email, user.firstName, rawToken);
      } catch (emailErr) {
        logger.error('Failed to send password reset email', { userId: user._id, error: emailErr.message });
        user.passwordResetToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(500).json({ success: false, error: 'Could not send reset email. Please try again.' });
      }

      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      logger.error('Forgot password error', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password using a valid token
 *     tags: [Authentication]
 */
router.post(
  '/reset-password',
  requireDbConnection,
  authLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() },
      });

      if (!user) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset token.' });
      }

      user.password = req.body.password;
      user.passwordResetToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      // Invalidate all existing sessions
      await incrementUserTokenVersion(user._id);

      res.json({ success: true, message: 'Password reset successfully. Please log in.' });
    } catch (err) {
      logger.error('Reset password error', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

module.exports = router;
