const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { asyncHandler, AuthenticationError, ValidationError, NotFoundError, ExternalServiceError } = require('../middleware/errorHandler');
const logger = require('../services/logger');



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
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +tokenVersion');
    // SECURITY: Use a generic error for both "user not found" and "wrong password"
    // to prevent user enumeration attacks.
    if (!user || !(await user.comparePassword(password))) {
      throw new AuthenticationError('Invalid email or password.');
    }

    // SECURITY: Validate JWT_SECRET before signing
    if (!process.env.JWT_SECRET) {
      throw new ExternalServiceError('Authentication service', 'Server configuration error: JWT_SECRET missing');
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

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
