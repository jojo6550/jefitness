const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('node-mailjet');
const { asyncHandler, AuthenticationError, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { logger } = require('../services/logger');

/**
 * Lazy initialization of Mailjet client
 */
const getMailjetClient = () => {
  if (!mailjet && process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
    mailjet = new Client({
      apiKey: process.env.MAILJET_API_KEY,
      apiSecret: process.env.MAILJET_SECRET_KEY
    });
  }
  return mailjet;
};

/**
 * Auth Controller handles registration, login, and security sessions
 */
const authController = {
  /**
   * Register a new user - Creates pending user, generates/sends OTP
   */
  signup: asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, dataProcessingConsent, healthDataConsent } = req.body;

    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      if (user.isEmailVerified) {
        throw new ValidationError('User already exists and verified');
      }
      // Allow resend for pending users
    } else {
      user = new User({
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
    }

    // Generate OTP (fire-and-forget)
    const otp = user.generateOTP();
    const hashedOTP = await user.hashOTP(otp);
    user.emailVerificationToken = hashedOTP;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

    // Send email NON-BLOCKING
    sendOTPEmail(email, otp).catch(err => logger.error('OTP email failed (signup)', { email, error: err.message }));

    res.status(201).json({
      success: true,
      message: 'User created successfully. Please check your email for verification code (or use /resend-otp).'
    });
  }),

  /**
   * Verify OTP and complete registration
   */
  verifyEmail: asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new ValidationError('User not found');
    }

    const isValidOTP = await user.compareOTP(otp);
    if (!isValidOTP) {
      throw new ValidationError('Invalid or expired OTP');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

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
   * Resend OTP to user email
   */
  resendOtp: asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Generate new OTP
    const otp = user.generateOTP();
    const hashedOTP = await user.hashOTP(otp);
    user.emailVerificationToken = hashedOTP;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTPEmail(email, otp, 'resendOtp');

    res.json({
      success: true,
      message: 'Verification code resent successfully.'
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

    if (!user.isEmailVerified) {
      throw new ValidationError('Please verify your email before logging in');
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
  }),

  /**
   * Check Mailjet message delivery status
   */
  getEmailStatus: asyncHandler(async (req, res) => {
    const { messageId } = req.params;

    if (!messageId) {
      throw new ValidationError('MessageID required');
    }

    const mailjetClient = getMailjetClient();
    if (!mailjetClient) {
      return res.status(503).json({
        success: false,
        message: 'Email service unavailable'
      });
    }

    const request = await mailjet
      .get(`send/${messageId}`, { 'version': 'v3.1' })
      .request();

    if (request.response?.status !== 200) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or service error',
        status: request.response?.status
      });
    }

    res.json({
      success: true,
      data: request.body.Messages[0]
    });
  })
};


// Send OTP email helper
async function sendOTPEmail(email, otp, context = 'unknown') {
  logger.info('OTP email attempt started', { to: email, otpMasked: otp.substring(0, 2) + '***', context });

  // Check Mailjet env vars
  const hasApiKey = !!process.env.MAILJET_API_KEY;
  const hasSecretKey = !!process.env.MAILJET_SECRET_KEY;
  logger.info('Mailjet config check', { 
    hasApiKey, 
    hasSecretKey,
    apiKeyLength: process.env.MAILJET_API_KEY ? process.env.MAILJET_API_KEY.length : 0,
    secretKeyLength: process.env.MAILJET_SECRET_KEY ? process.env.MAILJET_SECRET_KEY.length : 0 
  });

  try {
    const mailjetClient = getMailjetClient();
    if (!mailjetClient) {
      logger.error('Mailjet client not available - cannot send OTP', { to: email, context });
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Mailjet client missing - check API keys in .env');
      }
      return; 
    }
    logger.debug('Mailjet client ready, sending request', { to: email, context });

    const requestBody = {
      "Messages": [{
        "From": {
          "Email": "no-reply@jefitness.com",
          "Name": "JE Fitness"
        },
        "To": [{
          "Email": email,
          "Name": `${email}`
        }],
        "Subject": "Your JE Fitness Verification Code",
        "HTMLPart": `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to JE Fitness!</h2>
            <p>Your verification code is: <strong style="font-size: 24px; color: #007bff;">${otp}</strong></p>
            <p>This code expires in 10 minutes.</p>
            <hr>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `
      }]
    };
    logger.debug('Mailjet request body prepared', { to: email, messagesCount: requestBody.Messages.length, context });

    const request = mailjetClient
      .post("send", { 'version': 'v3.1' })
      .request(requestBody);

    const response = await request;
    logger.debug('Mailjet raw response', { 
      status: response.response?.status, 
      bodyKeys: response.body ? Object.keys(response.body) : null, 
      to: email, 
      context 
    });

    if (response.response?.status !== 200) {
      logger.error('Mailjet OTP send FAILED', {
        status: response.response?.status,
        body: response.body,
        errorMessage: response.ErrorMessage,
        to: email,
        context
      });
    } else {
      const messageId = response.body?.Messages?.[0]?.['MessageID'];
      logger.info('OTP email sent SUCCESSFULLY', {
        messageId,
        to: email,
        status: 200,
        otpMasked: otp.substring(0, 2) + '***',
        context
      });
    }
  } catch (error) {
    logger.error('OTP email send EXCEPTION', { 
      to: email, 
      error: error.message, 
      stack: error.stack,
      context 
    });
    if (process.env.NODE_ENV !== 'production') {
      throw error; // Surface for testing
    }
  }
}

module.exports = authController;
