const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const {
  asyncHandler,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
} = require('../middleware/errorHandler');
const { logger } = require('../services/logger');
const { sendEmailVerification } = require('../services/email');

/**
 * Auth Controller handles registration, login, and security sessions
 */
const authController = {
  /**
   * Register new user - Instant signup with token
   */
  signup: asyncHandler(async (req, res) => {
    const startTime = performance.now();
    const clientRequestId = req.get('X-Request-ID') || req.ip;

    // Extract and validate required fields from req.body (post-validation)
    const { firstName, lastName, email, password, dataProcessingConsent, healthDataConsent } = req.body;
    
    if (!email || !firstName || !lastName || !password) {
      throw new ValidationError('Missing required signup fields: firstName, lastName, email, or password');
    }
    
    // Normalize email (defense-in-depth)
    const normalizedEmail = email.trim().toLowerCase();
    
    // Privacy-safe email hash
    const emailHash = crypto
      .createHash('sha256')
      .update(normalizedEmail)
      .digest('hex')
      .slice(0, 16);

    // Privacy-safe logging
    logger.info('🔐 SIGNUP ATTEMPT START', {
      emailHash,
      hasPassword: !!password,
      clientRequestId,
      ip: req.ip,
    });

    let dbTime = 0;

    const dbStart = performance.now();
    const existingUser = await User.findOne({ email: normalizedEmail });
    dbTime = performance.now() - dbStart;
    if (existingUser) {
      const totalTime = performance.now() - startTime;
      logger.warn('❌ SIGNUP FAILED: User exists', { emailHash, clientRequestId, timings: { dbTime: dbTime.toFixed(2), total: totalTime.toFixed(2) } });
      throw new ValidationError('User already exists');
    }

    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    const user = new User({
      firstName,
      lastName,
      email: normalizedEmail,
      password,
      dataProcessingConsent: {
        given: dataProcessingConsent?.given === true,
        givenAt: dataProcessingConsent?.given === true ? new Date() : undefined,
        ipAddress,
        userAgent,
      },
      healthDataConsent: {
        given: healthDataConsent?.given === true,
        givenAt: healthDataConsent?.given === true ? new Date() : undefined,
        ipAddress,
        userAgent,
      },
    });
    // Generate email verification token
    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const saveStart = performance.now();
    await user.save();
    const saveTime = performance.now() - saveStart;

    const totalTime = performance.now() - startTime;
    logger.info('✅ SIGNUP SUCCESS', { 
      emailHash, 
      userId: user._id, 
      clientRequestId, 
      timings: { dbTime: dbTime.toFixed(2), saveTime: saveTime.toFixed(2), total: totalTime.toFixed(2) } 
    });

    // Send verification email (non-blocking — failure doesn't abort signup)
    sendEmailVerification(user.email, user.firstName, rawVerifyToken).catch(err => {
      logger.error('Failed to send verification email', { userId: user._id, error: err.message });
    });

    res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
    });
  }),



  /**
   * Log in user - Now checks email verification
   */
  login: asyncHandler(async (req, res) => {
    const startTime = performance.now();
const clientRequestId = req.get('X-Request-ID') || req.ip;
    const { email, password } = req.body;

    // Privacy-safe email hash (SHA256 first 16 chars)
    const emailHash = crypto
      .createHash('sha256')
      .update(email.toLowerCase())
      .digest('hex')
      .slice(0, 16);

    // Log ALL attempts (successful + failed) with correlation ID
    logger.info('🔐 LOGIN ATTEMPT START', {
      emailHash,
      clientRequestId,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.slice(0, 100),
    });

    let dbTime = 0,
      bcryptTime = 0,
      jwtTime = 0;

    try {
      // DB Query timing - minimal fields first
      const dbStart = performance.now();
      let user = await User.findOne({ email: email.toLowerCase() }).select(
        '+password +tokenVersion +twoFactorEnabled +isEmailVerified'
      );
      dbTime = performance.now() - dbStart;

      logger.debug('📊 LOGIN DB QUERY', {
        emailHash,
        clientRequestId,
        dbTime: dbTime.toFixed(2),
        userFound: !!user,
      });

      // Auth check timing
      if (!user || !(await user.comparePassword(password))) {
        bcryptTime = performance.now() - dbStart;
        logger.warn('❌ LOGIN FAILED', {
          emailHash,
          clientRequestId,
          ip: req.ip,
          reason: !user ? 'USER_NOT_FOUND' : 'INVALID_PASSWORD',
          dbTime: dbTime.toFixed(2),
          bcryptTime: bcryptTime.toFixed(2),
        });
        throw new AuthenticationError('Invalid email or password.');
      }

      bcryptTime = performance.now() - dbStart;

      // Block unverified accounts
      if (!user.isEmailVerified) {
        logger.warn('❌ LOGIN BLOCKED: email not verified', { emailHash, clientRequestId, ip: req.ip });
        return res.status(403).json({
          success: false,
          requiresEmailVerification: true,
          email: user.email,
          error: { message: 'Please verify your email before logging in.' },
        });
      }

      // JWT signing timing
      const jwtStart = performance.now();
      if (!process.env.JWT_SECRET) {
        logger.error('❌ JWT_SECRET MISSING', { emailHash, clientRequestId });
        throw new ExternalServiceError(
          'Authentication service',
          'Server configuration error: JWT_SECRET missing'
        );
      }

      // If 2FA is enabled, issue a short-lived temp token instead of a full session
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign(
          { id: user._id, twoFactorPending: true },
          process.env.JWT_SECRET,
          { expiresIn: '5m' }
        );
        jwtTime = performance.now() - jwtStart;
        const totalTime = performance.now() - startTime;
        logger.info('✅ LOGIN: 2FA REQUIRED', { emailHash, userId: user._id, clientRequestId, timings: { total: totalTime.toFixed(2) } });
        return res.json({ success: true, requiresTwoFactor: true, tempToken });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      jwtTime = performance.now() - jwtStart;

      const totalTime = performance.now() - startTime;
      logger.info('✅ LOGIN SUCCESS', {
        emailHash,
        userId: user._id,
        role: user.role,
        clientRequestId,
        ip: req.ip,
        timings: {
          dbTime: dbTime.toFixed(2),
          bcryptTime: bcryptTime.toFixed(2),
          jwtTime: jwtTime.toFixed(2),
          total: totalTime.toFixed(2),
        },
      });

      // Update last login (use updateOne to avoid triggering validators on unrelated fields)
      await user.updateOne({ lastLoggedIn: new Date() });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24h, matches JWT expiry
      });

      res.json({
        success: true,
        data: {
          token, // kept for backward compat — clients should prefer the cookie
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (loginError) {
      const totalTime = performance.now() - startTime;
      logger.error('💥 LOGIN ERROR', {
        emailHash,
        clientRequestId,
        ip: req.ip,
        error: loginError.message,
        errorType: loginError.constructor.name,
        dbTime: dbTime.toFixed(2),
        totalTime: totalTime.toFixed(2),
        stack: loginError.stack,
      });
      throw loginError;
    }
  }),

  /**
   * Grant data processing and health data consent for the authenticated user.
   * Used to retroactively record consent for users created before consent tracking,
   * and called automatically by the frontend when a CONSENT_REQUIRED 403 is received.
   */
  grantConsent: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    await User.findByIdAndUpdate(userId, {
      'dataProcessingConsent.given': true,
      'dataProcessingConsent.givenAt': new Date(),
      'dataProcessingConsent.ipAddress': ipAddress,
      'dataProcessingConsent.userAgent': userAgent,
      'healthDataConsent.given': true,
      'healthDataConsent.givenAt': new Date(),
      'healthDataConsent.ipAddress': ipAddress,
      'healthDataConsent.userAgent': userAgent,
    });

    res.json({ success: true, message: 'Consent recorded successfully' });
  }),

  /**
   * Logout user (Token revocation via versioning)
   */
  logout: asyncHandler(async (req, res) => {
    const { incrementUserTokenVersion } = require('../middleware/auth');
    await incrementUserTokenVersion(req.user.id);

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({ success: true, message: 'Logged out successfully' });
  }),

  /**
   * GET /api/v1/auth/me - Get current authenticated user profile
   * @swagger
   * /api/v1/auth/me:
   *   get:
   *     summary: Get current user profile
   *     tags: [Authentication]
   *     security:
   *       - cookieAuth: []
   */
  getMe: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select(
      '-password -emailVerificationToken -passwordResetToken -twoFactorSecret -twoFactorBackupCodes -tokenVersion'
    );
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json({ success: true, data: user });
  }),
};

module.exports = authController;
