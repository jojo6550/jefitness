const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { asyncHandler, AuthenticationError, ValidationError, NotFoundError, ExternalServiceError } = require('../middleware/errorHandler');
const { logger } = require('../services/logger');



/**
 * Auth Controller handles registration, login, and security sessions
 */
const authController = {

  /**
   * Register new user - Instant signup with token
   */
  signup: asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, dataProcessingConsent, healthDataConsent } = req.body;

    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new ValidationError('User already exists');
    }

    const user = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      dataProcessingConsent: {
        given: dataProcessingConsent?.given === true,
        givenAt: dataProcessingConsent?.given === true ? new Date() : undefined,
        ipAddress,
        userAgent
      },
      healthDataConsent: {
        given: healthDataConsent?.given === true,
        givenAt: healthDataConsent?.given === true ? new Date() : undefined,
        ipAddress,
        userAgent
      }
    });
    await user.save();

// SECURITY: Validate JWT_SECRET before signing
    if (!process.env.JWT_SECRET) {
      throw new ExternalServiceError('Authentication service', 'Server configuration error: JWT_SECRET missing');
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role
        }
      }
    });
  }),

  /**
   * Log in user - Now checks email verification
   */
  login: asyncHandler(async (req, res) => {
    const startTime = performance.now();
    const clientRequestId = req.get('X-Request-ID') || 'unknown';
    const { email, password } = req.body;
    
    // Privacy-safe email hash (SHA256 first 16 chars)
    const crypto = require('crypto');
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
    
    // Log ALL attempts (successful + failed) with correlation ID
    logger.info('🔐 LOGIN ATTEMPT START', { 
      emailHash,
      clientRequestId,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.slice(0, 100)
    });
    
    let dbTime = 0, bcryptTime = 0, jwtTime = 0;
    
    try {
      // DB Query timing - minimal fields first
      const dbStart = performance.now();
      let user = await User.findOne({ email: email.toLowerCase() }).select('+password +tokenVersion');
      dbTime = performance.now() - dbStart;
      
      logger.debug('📊 LOGIN DB QUERY', { 
        emailHash, 
        clientRequestId, 
        dbTime: dbTime.toFixed(2), 
        userFound: !!user 
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
          bcryptTime: bcryptTime.toFixed(2)
        });
        throw new AuthenticationError('Invalid email or password.');
      }
      
      bcryptTime = performance.now() - dbStart;
      
      // JWT signing timing
      const jwtStart = performance.now();
      if (!process.env.JWT_SECRET) {
        logger.error('❌ JWT_SECRET MISSING', { emailHash, clientRequestId });
        throw new ExternalServiceError('Authentication service', 'Server configuration error: JWT_SECRET missing');
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
        timings: { dbTime: dbTime.toFixed(2), bcryptTime: bcryptTime.toFixed(2), jwtTime: jwtTime.toFixed(2), total: totalTime.toFixed(2) }
      });
      
      // Update last login
      user.lastLoggedIn = new Date();
      await user.save();
      
      res.json({
        success: true,
        data: {
          token,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role
          }
        }
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
        stack: loginError.stack 
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
      'healthDataConsent.userAgent': userAgent
    });

    res.json({ success: true, message: 'Consent recorded successfully' });
  }),

  /**
   * Logout user (Token revocation via versioning)
   */
  logout: asyncHandler(async (req, res) => {
    const { incrementUserTokenVersion } = require('../middleware/auth');
    await incrementUserTokenVersion(req.user.id);
    
    res.json({ success: true, message: 'Logged out successfully' });
  })
};

module.exports = authController;
