const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('node-mailjet');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const { auth, incrementUserTokenVersion, getUserTokenVersion } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { stripDangerousFields, preventNoSQLInjection, allowOnlyFields } = require('../middleware/inputValidator');
const { requireDbConnection } = require('../middleware/dbConnection');
const { asyncHandler, AuthenticationError, ValidationError, NotFoundError } = require('../middleware/errorHandler');

// Lazy initialization of Stripe to avoid issues in test environment
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

// Lazy initialization of Mailjet client
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
 * Helper function to create Stripe customer for a user
 * Stripe failures are logged but do not block the operation
 */
const createStripeCustomerForUser = async (user) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || user.stripeCustomerId) {
      return; // Skip if no Stripe key or customer already exists
    }

    const stripe = getStripe();
    if (!stripe) return; // Skip if Stripe not initialized

    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user._id.toString()
      }
    });

    user.stripeCustomerId = customer.id;
    user.subscriptionStatus = 'inactive'; // Default to inactive (free tier)
    await user.save();
    console.log(`Stripe customer created | UserId: ${user._id} | CustomerId: ${customer.id}`);
  } catch (err) {
    console.error(`Stripe customer creation failed (non-blocking) | UserId: ${user._id} | Error: ${err.message}`);
    // Stripe failure does not block registration
  }
};


// Password strength validation function
const validatePasswordStrength = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
        return 'Password must be at least 8 characters long.';
    }
    if (!hasUpperCase) {
        return 'Password must contain at least one uppercase letter.';
    }
    if (!hasLowerCase) {
        return 'Password must contain at least one lowercase letter.';
    }
    if (!hasNumbers) {
        return 'Password must contain at least one number.';
    }
    if (!hasSpecialChar) {
        return 'Password must contain at least one special character.';
    }
    return null; // Password is strong
};

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 description: User's password (must meet strength requirements)
 *     responses:
 *       201:
 *         description: Signup successful, verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 email:
 *                   type: string
 *       400:
 *         description: Validation failed, user already exists, or weak password
 *       500:
 *         description: Server error
 */
// SECURITY: Apply NoSQL injection prevention and dangerous field stripping to all auth routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

router.post('/signup', requireDbConnection, authLimiter, [
    body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
    body('dataProcessingConsent.given').isBoolean().withMessage('Data processing consent is required'),
    body('healthDataConsent.given').isBoolean().withMessage('Health data consent is required')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array().map(err => err.msg));
    }

    const { firstName, lastName, email, password } = req.body;
    console.log(`User action: signup_attempt | Email: ${email} | FirstName: ${firstName} | LastName: ${lastName}`);

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
        throw new ValidationError(passwordError);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) throw new ValidationError('An account with this email already exists.');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const newUser = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role: 'user', // Default new signups to 'user' role
        emailVerificationToken: otp,
        emailVerificationExpires: otpExpires,
        dataProcessingConsent: req.body.dataProcessingConsent,
        healthDataConsent: req.body.healthDataConsent
    });

    await newUser.save();

        // For test environment, auto-verify email to simplify integration tests
        if (process.env.NODE_ENV === 'test') {
            newUser.isEmailVerified = true;
            await newUser.save();
        }

        // Create Stripe customer (non-blocking)
        await createStripeCustomerForUser(newUser);

        // Send OTP email via Mailjet (skip in test environment)
        if (process.env.NODE_ENV !== 'test') {
            const mailjetClient = getMailjetClient();
            if (mailjetClient) {
                const htmlPart = `<p>Hi <strong>${firstName}</strong>,</p>
                                       <p>Your verification code is: <strong>${otp}</strong></p>
                                       <p>This code will expire in 10 minutes.</p>
                                       <p>Best regards,<br>JE Fitness Team</p>`;
                const request = mailjetClient.post('send', { version: 'v3.1' }).request({
                    Messages: [
                        {
                            From: {
                                Email: 'josiah.johnson6550@gmail.com',
                                Name: 'JE Fitness'
                            },
                            To: [
                                {
                                    Email: email,
                                    Name: `${firstName} ${lastName}`
                                }
                            ],
                            Subject: 'Verify Your Email - JE Fitness',
                            TextPart: `Hi ${firstName},\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nBest,\nJE Fitness Team`,
                            HTMLPart: htmlPart
                        }
                    ]
                });
                try {
                    await request;
                    console.log(`User action: otp_email_sent | UserId: ${newUser._id} | Email: ${email}`);
                } catch (emailErr) {
                    console.error(`Error: ${JSON.stringify(emailErr)} | Context: OTP email sending during signup | UserId: ${newUser._id}`);
                    // Do not stop signup because of email failure
                }
            }
        }

        console.log(`User action: signup_pending_verification | UserId: ${newUser._id} | Email: ${email}`);

        // For test environment, return token immediately since email is auto-verified
        if (process.env.NODE_ENV === 'test') {
            // SECURITY: Issue JWT token with token version (from database)
            const tokenVersion = await getUserTokenVersion(newUser._id);
            const token = jwt.sign({
                id: newUser._id,
                userId: newUser._id,
                role: newUser.role,
                tokenVersion
            }, process.env.JWT_SECRET, { expiresIn: '1h' });

            res.status(201).json({
                success: true,
                message: 'User created successfully.',
                token,
                user: {
                    id: newUser._id,
                    email: newUser.email.toLowerCase(),
                    firstName: newUser.firstName
                }
            });
        } else {
            res.status(201).json({
                success: true,
                message: 'User created successfully. Please check your email to verify your account.',
                user: {
                    id: newUser._id,
                    email: newUser.email.toLowerCase(),
                    firstName: newUser.firstName
                }
            });
        }

}));

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and return JWT token with account lockout protection
 * @access Public
 * @param {Object} req.body - User login credentials
 * @param {string} req.body.email - User's email address (required, must be valid email)
 * @param {string} req.body.password - User's password (required)
 * @returns {Object} JWT token and user information
 * @throws {400} Validation failed or invalid credentials
 * @throws {401} Invalid credentials
 * @throws {423} Account locked due to too many failed attempts
 * @throws {500} Server error during authentication
 * @sideEffects Updates failed login attempts, locks account after 5 failures, logs login events
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Authenticate user and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 description: User's password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Validation failed, invalid credentials, or email not verified
 *       423:
 *         description: Account locked due to too many failed attempts
 *       500:
 *         description: Server error
 */
router.post('/login', requireDbConnection, authLimiter, preventNoSQLInjection, allowOnlyFields(['email', 'password'], true), [
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array().map(err => err.msg));
    }

    const { email, password } = req.body;
    console.log(`Security event: login_attempt | Email: ${email}`);

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
        console.log(`Security event: login_failed | Email: ${email} | Reason: User not found`);
        throw new AuthenticationError('Invalid email or password.');
    }

    // Check if account is locked
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        const remainingTime = Math.ceil((user.lockoutUntil - new Date()) / 1000 / 60); // minutes
        throw new ValidationError(`Account is locked due to too many failed attempts. Try again in ${remainingTime} minutes.`, [], 423);
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
        throw new ValidationError('Please verify your email before logging in.');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        // Increment failed login attempts
        user.failedLoginAttempts += 1;

        // Lock account after 5 failed attempts
        if (user.failedLoginAttempts >= 5) {
            user.lockoutUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        }

        await user.save();
        throw new AuthenticationError('Invalid email or password.');
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    user.lastLoggedIn = new Date();

    // Lazily create Stripe customer if missing (non-blocking)
    if (!user.stripeCustomerId) {
        await createStripeCustomerForUser(user);
    }

    await user.save();

    // SECURITY: Include role and token version in JWT payload (from database)
    const tokenVersion = await getUserTokenVersion(user._id);

    const token = jwt.sign({
        id: user._id,
        userId: user._id,
        role: user.role,
        tokenVersion
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log(`Security event: login_success | UserId: ${user._id} | Email: ${email} | Role: ${user.role}`);

    res.json({
        success: true,
        message: 'Login successful',
        token,
        user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role }
    });
}));

/**
 * @swagger
 * /api/v1/auth/account:
 *   get:
 *     summary: Get logged in user's account information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account information retrieved successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/account', auth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
        throw new NotFoundError('User');
    }

    res.json({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        billingEnvironment: user.billingEnvironment,
        stripeCustomerId: user.stripeCustomerId
    });
}));

/**
 * @swagger
 * /api/v1/auth/account:
 *   put:
 *     summary: Update account information (name, email, password)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               currentPassword:
 *                 type: string
 *                 description: Required if changing password
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account updated successfully
 *       400:
 *         description: Validation failed or invalid current password
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/account', auth, [
    body('firstName').optional().trim().isLength({ min: 1 }),
    body('lastName').optional().trim().isLength({ min: 1 }),
    body('email').optional().isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('newPassword').optional().isLength({ min: 8 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array().map(err => err.msg));
    }

    const { firstName, lastName, email, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        throw new NotFoundError('User');
    }

    // If changing password, verify current password
    if (newPassword) {
        if (!currentPassword) {
            throw new ValidationError('Current password is required to change password');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            console.log(`Security event: password_change_failed | UserId: ${user._id}`);
            throw new ValidationError('Current password is incorrect');
        }

        // Validate new password strength
        const passwordError = validatePasswordStrength(newPassword);
        if (passwordError) {
            throw new ValidationError(passwordError);
        }

        // SECURITY: Hash and update password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        
        // SECURITY: Invalidate all existing tokens
        await incrementUserTokenVersion(user._id);
    }

    // Update name fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;

    // If email is changing
    if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ValidationError('Email is already in use');
        }

        user.email = email;

        // Sync email with Stripe customer (non-blocking)
        if (user.stripeCustomerId) {
            try {
                const stripe = getStripe();
                if (stripe) {
                    await stripe.customers.update(user.stripeCustomerId, {
                        email: email,
                        name: `${user.firstName} ${user.lastName}`,
                        metadata: {
                            firstName: user.firstName,
                            lastName: user.lastName
                        }
                    });
                }
            } catch (stripeErr) {
                console.error(`Stripe customer update failed: ${stripeErr.message}`);
            }
        }
    }

    await user.save();

    res.json({
        msg: 'Account updated successfully',
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone
        }
    });
}));

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get logged in user's full profile details
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *                 dob:
 *                   type: string
 *                 gender:
 *                   type: string
 *                 phone:
 *                   type: string
 *                 activityStatus:
 *                   type: string
 *                 startWeight:
 *                   type: number
 *                 currentWeight:
 *                   type: number
 *                 goals:
 *                   type: string
 *                 reason:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/me', auth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
        throw new NotFoundError('User');
    }

    res.json({
        success: true,
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            dob: user.dob,
            gender: user.gender,
            phone: user.phone,
            activityStatus: user.activityStatus,
            startWeight: user.startWeight,
            currentWeight: user.currentWeight,
            goals: user.goals,
            reason: user.reason,
            createdAt: user.createdAt
        }
    });
}));

/**
 * @swagger
 * /api/v1/auth/profile:
 *   put:
 *     summary: Update logged in user's profile information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *               dob:
 *                 type: string
 *                 description: Date of birth
 *               gender:
 *                 type: string
 *                 description: Gender
 *               phone:
 *                 type: string
 *                 description: Phone number
 *               activityStatus:
 *                 type: string
 *                 description: Activity status
 *               startWeight:
 *                 type: number
 *                 description: Starting weight
 *               currentWeight:
 *                 type: number
 *                 description: Current weight
 *               goals:
 *                 type: string
 *                 description: Fitness goals
 *               reason:
 *                 type: string
 *                 description: Reason for joining
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     dob:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     activityStatus:
 *                       type: string
 *                     startWeight:
 *                       type: number
 *                     currentWeight:
 *                       type: number
 *                     goals:
 *                       type: string
 *                     reason:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/profile', auth, allowOnlyFields(['firstName', 'lastName', 'dob', 'gender', 'phone', 'activityStatus', 'startWeight', 'currentWeight', 'goals', 'reason'], true), asyncHandler(async (req, res) => {
    const {
        firstName,
        lastName,
        dob,
        gender,
        phone,
        activityStatus,
        startWeight,
        currentWeight,
        goals,
        reason
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        throw new NotFoundError('User');
    }

    // Update fields if provided
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (dob !== undefined) user.dob = dob;
    if (gender !== undefined) user.gender = gender;
    if (phone !== undefined) user.phone = phone;
    if (activityStatus !== undefined) user.activityStatus = activityStatus;
    if (startWeight !== undefined) user.startWeight = startWeight;
    if (currentWeight !== undefined) user.currentWeight = currentWeight;
    if (goals !== undefined) user.goals = goals;
    if (reason !== undefined) user.reason = reason;

    await user.save();

    res.json({
        msg: 'Profile updated successfully',
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            dob: user.dob,
            gender: user.gender,
            phone: user.phone,
            activityStatus: user.activityStatus,
            startWeight: user.startWeight,
            currentWeight: user.currentWeight,
            goals: user.goals,
            reason: user.reason,
            createdAt: user.createdAt
        }
    });
}));



/**
 * @route   GET /api/v1/auth/schedule
 * @desc    Get logged-in user's schedule
 * @access  Private
 * @returns {Object} User's schedule object
 * @throws  {404} User not found
 * @throws  {500} Server error
 */
router.get('/schedule', auth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('schedule');
    if (!user) {
        throw new NotFoundError('User');
    }

    res.json(user.schedule);
}));

/**
 * @route   PUT /api/v1/auth/schedule
 * @desc    Update logged-in user's schedule
 * @access  Private
 * @body    {Object} schedule - Schedule data object
 * @returns {Object} Success message and updated schedule object
 * @throws  {400} Schedule data is required
 * @throws  {404} User not found
 * @throws  {500} Server error
 */
router.put('/schedule', auth, asyncHandler(async (req, res) => {
    const { schedule } = req.body;
    if (!schedule) {
        throw new ValidationError('Schedule data is required');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
        throw new NotFoundError('User');
    }

    user.schedule = schedule;
    await user.save();

    res.json({ msg: 'Schedule updated successfully', schedule: user.schedule });
}));

/**
 * @route   GET /api/v1/auth/clients
 * @desc    Get all clients (Admin only)
 * @access  Private (Admin)
 * @returns {Array} Array of user objects
 * @throws  {403} Access denied: Admins only
 * @throws  {500} Server error
 */
router.get('/clients', auth, asyncHandler(async (req, res) => {
    // Only allow admins
    if (req.user.role !== 'admin') {
        throw new AuthorizationError('Access denied: Admins only');
    }

    const users = await User.find().select('-password'); // Exclude password
    res.json(users);
}));

// FORGOT PASSWORD ROUTE
router.post('/forgot-password', passwordResetLimiter, [
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email is required')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array().map(err => err.msg));
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        // Do not reveal if user exists for security
        return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetToken = resetToken;
    user.resetExpires = resetExpires;
    await user.save();

    // Send reset email via Mailjet
    if (process.env.NODE_ENV !== 'test') {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
        const mailjetClient = getMailjetClient();
        if (mailjetClient) {
            const htmlPart = `<p>Hi <strong>${user.firstName}</strong>,</p>
                               <p>You requested a password reset. Click the link below to reset your password:</p>
                               <p><a href="${resetUrl}">Reset Password</a></p>
                               <p>This link will expire in 10 minutes.</p>
                               <p>If you didn't request this, please ignore this email.</p>
                               <p>Best regards,<br>JE Fitness Team</p>`;
            const request = mailjetClient.post('send', { version: 'v3.1' }).request({
                Messages: [
                    {
                        From: { Email: 'josiah.johnson6550@gmail.com', Name: 'JE Fitness' },
                        To: [{ Email: email, Name: `${user.firstName} ${user.lastName}` }],
                        Subject: 'Password Reset - JE Fitness',
                        TextPart: `Hi ${user.firstName},\n\nYou requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest,\nJE Fitness Team`,
                        HTMLPart: htmlPart
                    }
                ]
            });

            try {
                await request;
            } catch (emailErr) {
                console.error(`Reset email sending failed: ${emailErr.message}`);
                throw new Error('Error sending email. Please try again.');
            }
        }
    }

    res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
}));

// RESET PASSWORD ROUTE
router.post('/reset-password', asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        throw new ValidationError('Token and new password are required.');
    }

    const user = await User.findOne({
        resetToken: token,
        resetExpires: { $gt: new Date() }
    });

    if (!user) {
        throw new ValidationError('Invalid or expired reset token.');
    }

    // SECURITY: Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
        throw new ValidationError(passwordError);
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    
    await incrementUserTokenVersion(user._id);
    await user.save();

    res.status(200).json({ msg: 'Password reset successfully. You can now log in with your new password.' });
}));

// EMAIL VERIFICATION ROUTE
router.post('/verify-email', asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ValidationError('Email and OTP are required.');
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw new NotFoundError('User');
    }

    if (user.isEmailVerified) {
        throw new ValidationError('Email already verified.');
    }

    if (!user.emailVerificationToken || user.emailVerificationToken !== otp) {
        throw new ValidationError('Invalid OTP.');
    }

    if (new Date() > user.emailVerificationExpires) {
        throw new ValidationError('OTP has expired. Please request a new one.');
    }

    // Verify the email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // SECURITY: Issue JWT token with token version
    const tokenVersion = await getUserTokenVersion(user._id);
    const token = jwt.sign({ 
        id: user._id, 
        userId: user._id,
        role: user.role,
        tokenVersion 
    }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Send confirmation email
    const mailjetClient = getMailjetClient();
    if (mailjetClient) {
        const request = mailjetClient.post('send', { version: 'v3.1' }).request({
            Messages: [{
                From: { Email: 'josiah.johnson6550@gmail.com', Name: 'JE Fitness' },
                To: [{ Email: email, Name: `${user.firstName} ${user.lastName}` }],
                Subject: 'Welcome to JE Fitness!',
                TextPart: `Hi ${user.firstName},\n\nThank you for signing up with JE Fitness.`,
                HTMLPart: `<p>Hi <strong>${user.firstName}</strong>,</p><p>Thank you for signing up with JE Fitness.</p>`
            }]
        });
        try { await request; } catch (e) { console.error('Confirmation email failed'); }
    }

    res.status(200).json({
        msg: 'Email verified successfully! Welcome to JE Fitness.',
        token,
        user: {
            id: user._id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            role: user.role
        }
    });
}));

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.post('/logout', auth, asyncHandler(async (req, res) => {
    // SECURITY: Increment token version
    await incrementUserTokenVersion(req.user.id);

    console.log(`Security event: logout | UserId: ${req.user.id}`);
    res.json({ success: true, message: 'Logged out successfully' });
}));

module.exports = router;
