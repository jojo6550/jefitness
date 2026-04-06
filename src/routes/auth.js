const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');

const authController = require('../controllers/authController');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24h
};

function setAuthCookie(res, token) {
  res.cookie('token', token, COOKIE_OPTIONS);
}
const { auth, incrementUserTokenVersion } = require('../middleware/auth');
const { requireDbConnection } = require('../middleware/dbConnection');
const { authLimiter, signupLimiter, verificationPollLimiter } = require('../middleware/rateLimiter');
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
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
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
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
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
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 */
router.get('/me', requireDbConnection, auth, authController.getMe);

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
    const verificationToken = req.query.token;
    if (!verificationToken) {
    return res.status(400).json({ success: false, error: 'Verification token is required.' });
  }

  const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

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

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    setAuthCookie(res, token);
    res.json({
      success: true,
      token,
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
    });
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
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
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
 * POST /api/v1/auth/check-verification
 * Polling endpoint: returns whether the given email has been verified yet.
 * Issues a full session JWT once verified so the frontend can log the user in.
 */
router.post(
  '/check-verification',
  requireDbConnection,
  verificationPollLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+tokenVersion');
      if (!user) {
        return res.json({ success: true, verified: false });
      }
      if (!user.isEmailVerified) {
        return res.json({ success: true, verified: false });
      }
      const token = jwt.sign(
        { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      setAuthCookie(res, token);
      res.json({
        success: true,
        verified: true,
        token,
        user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
      });
    } catch (err) {
      logger.error('Check verification error', { error: err.message });
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
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
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

// ============================
// Google OAuth Routes (disabled)
// ============================
router.get('/google', (_req, res) => res.status(503).json({ msg: 'Google login is currently disabled' }));
router.get('/google/callback', (_req, res) => res.redirect('/login?error=google_auth_disabled'));

// ============================
// 2FA Routes
// ============================
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * POST /api/v1/auth/2fa/setup
 * Generate a TOTP secret + QR code URI for the authenticated user.
 * The secret is NOT saved until /2fa/verify confirms the code works.
 */
router.post('/2fa/setup', auth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `JE Fitness (${req.user.email || req.user.id})`,
      length: 20,
    });

    // Store pending secret in a short-lived JWT so we don't write to DB until verified
    const setupToken = jwt.sign(
      { id: req.user.id, twoFactorSecret: secret.base32, setupPending: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({ success: true, setupToken, qrCode: qrDataUrl, manualKey: secret.base32 });
  } catch (err) {
    logger.error('2FA setup error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/v1/auth/2fa/verify
 * Verify a TOTP code against the pending setup token; enable 2FA on the account.
 * Body: { setupToken, code }
 */
router.post('/2fa/verify', auth, async (req, res) => {
  try {
    const { setupToken, code } = req.body;
    if (!setupToken || !code) {
      return res.status(400).json({ success: false, error: 'setupToken and code are required' });
    }

    let payload;
    try {
      payload = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid or expired setup token' });
    }

    if (!payload.setupPending || payload.id !== req.user.id) {
      return res.status(400).json({ success: false, error: 'Invalid setup token' });
    }

    const valid = speakeasy.totp.verify({
      secret: payload.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    const hashedBackups = backupCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));

    await User.findByIdAndUpdate(req.user.id, {
      twoFactorSecret: payload.twoFactorSecret,
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedBackups,
    });

    logger.info('2FA enabled', { userId: req.user.id });
    res.json({ success: true, message: '2FA enabled successfully', backupCodes });
  } catch (err) {
    logger.error('2FA verify error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/v1/auth/2fa/disable
 * Disable 2FA. Requires current TOTP code for confirmation.
 * Body: { code }
 */
router.post('/2fa/disable', auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code is required' });

    const user = await User.findById(req.user.id).select('+twoFactorSecret +twoFactorEnabled');
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled' });
    }

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid code' });
    }

    await User.findByIdAndUpdate(req.user.id, {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
    });

    logger.info('2FA disabled', { userId: req.user.id });
    res.json({ success: true, message: '2FA disabled' });
  } catch (err) {
    logger.error('2FA disable error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/v1/auth/2fa/authenticate
 * Complete login when 2FA is required.
 * Body: { tempToken, code }
 * Returns a full session JWT on success.
 */
router.post('/2fa/authenticate', authLimiter, async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ success: false, error: 'tempToken and code are required' });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    if (!payload.twoFactorPending) {
      return res.status(400).json({ success: false, error: 'Invalid token type' });
    }

    const user = await User.findById(payload.id).select('+twoFactorSecret +twoFactorBackupCodes +tokenVersion');
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });

    // Check TOTP first
    let valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    // Fall back to backup code (single-use — remove after use)
    if (!valid) {
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const backupIdx = user.twoFactorBackupCodes.indexOf(codeHash);
      if (backupIdx !== -1) {
        valid = true;
        user.twoFactorBackupCodes.splice(backupIdx, 1);
        await user.save({ validateBeforeSave: false });
      }
    }

    if (!valid) {
      logger.warn('2FA authentication failed', { userId: user._id });
      return res.status(401).json({ success: false, error: 'Invalid authentication code' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.lastLoggedIn = new Date();
    await user.save({ validateBeforeSave: false });

    setAuthCookie(res, token);
    logger.info('2FA login success', { userId: user._id });
    res.json({
      success: true,
      data: {
        token,
        user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    logger.error('2FA authenticate error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
