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
   * Register a new user
   */
  signup: asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      throw new ValidationError('User already exists');
    }

    user = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password
    });

    await user.save();

    // Note: Stripe customer creation usually happens here or via webhook
    // For now keeping it simple as per existing logic

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
   * Log in user
   */
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      throw new AuthenticationError('Invalid credentials');
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
  })
};

module.exports = authController;
