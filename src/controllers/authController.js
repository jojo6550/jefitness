const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('node-mailjet');
const { asyncHandler, AuthenticationError, ValidationError, NotFoundError } = require('../middleware/errorHandler');

/**
 * Lazy initialization of Mailjet client
 */
let mailjet = null;
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
    const { firstName, lastName, email, password } = req.body;

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
        password
      });
      await user.save();
    }

    // Generate OTP
    const otp = user.generateOTP();
    const hashedOTP = await user.hashOTP(otp);
    user.emailVerificationToken = hashedOTP;
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

    // Send email
    await sendOTPEmail(email, otp);

    res.status(201).json({
      success: true,
      message: 'User created successfully. Please check your email for the verification code.'
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

    await sendOTPEmail(email, otp);

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
    if (!user) {
      throw new AuthenticationError(`No account found for email: ${email}`);
    }

    if (!user.isEmailVerified) {
      throw new ValidationError('Please verify your email before logging in');
    }

    if (!(await user.comparePassword(password))) {
      throw new AuthenticationError('Incorrect password');
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

    const mailjet = getMailjetClient();
    if (!mailjet) {
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
  };
};


// Send OTP email helper
async function sendOTPEmail(email, otp) {
  const mailjet = getMailjetClient();
  if (!mailjet) {
    console.warn('Mailjet not configured. Cannot send OTP email.');
    return; // Don't fail signup, log warning
  }


  const request = await mailjet
    .post("send", { 'version': 'v3.1' })
    .request({
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
    });

  if (request.response?.status !== 200) {
    console.error('Mailjet OTP send failed:', {
      status: request.response?.status,
      body: request.body,
      error: request.ErrorMessage
    });
  } else {
    const messageId = request.body?.Messages?.[0]?.['MessageID'];
    console.log('OTP email sent successfully. Track:', {
      messageId,
      to: email,
      otp: otp.substring(0, 2) + '***'  // Partial for logs
    });
  }

}

module.exports = authController;
