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
 * /api/auth/signup:
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
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg);
        return res.status(400).json({ success: false, error: errorMessages.join(', ') });
    }

    const { firstName, lastName, email, password } = req.body;
    console.log(`User action: signup_attempt | Email: ${email} | FirstName: ${firstName} | LastName: ${lastName}`);

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
        return res.status(400).json({ success: false, error: passwordError });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, error: 'already exists' });

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
        res.status(201).json({
            success: true,
            message: 'User created successfully. Please check your email to verify your account.',
            user: {
                id: newUser._id,
                email: newUser.email.toLowerCase(),
                firstName: newUser.firstName
            }
        });

    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: User signup | Email: ${email}`);
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

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
 * /api/auth/login:
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
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log(`Security event: login_attempt | Email: ${email}`);

    try {
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`Security event: login_failed | Email: ${email} | Reason: User not found`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if account is locked
        if (user.lockoutUntil && user.lockoutUntil > new Date()) {
            const remainingTime = Math.ceil((user.lockoutUntil - new Date()) / 1000 / 60); // minutes
            console.log(`Security event: login_failed | UserId: ${user._id} | Email: ${email} | Reason: Account locked | LockoutMinutes: ${remainingTime}`);
            return res.status(423).json({ msg: `Account is locked due to too many failed attempts. Try again in ${remainingTime} minutes.` });
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            console.log(`Security event: login_failed | UserId: ${user._id} | Email: ${email} | Reason: Email not verified`);
            return res.status(400).json({ msg: 'Please verify your email before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Increment failed login attempts
            user.failedLoginAttempts += 1;

            // Lock account after 5 failed attempts for 2 hours
            if (user.failedLoginAttempts >= 5) {
                user.lockoutUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
                console.log(`Security event: account_locked | UserId: ${user._id} | Email: ${email} | Reason: Too many failed attempts`);
            }

            await user.save();
            console.log(`Security event: login_failed | UserId: ${user._id} | Email: ${email} | Reason: Invalid password | Attempts: ${user.failedLoginAttempts}`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
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
            user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role } // Include role in response
        });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: User login | Email: ${email}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

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
router.get('/account', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        console.log(`User action: account_info_accessed | UserId: ${req.user.id}`);
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
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get account info | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

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
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, currentPassword, newPassword } = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // If changing password, verify current password
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ msg: 'Current password is required to change password' });
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                console.log(`Security event: password_change_failed | UserId: ${user._id} | Reason: Invalid current password`);
                return res.status(400).json({ msg: 'Current password is incorrect' });
            }

            // Validate new password strength
            const passwordError = validatePasswordStrength(newPassword);
            if (passwordError) {
                return res.status(400).json({ msg: passwordError });
            }

            // SECURITY: Hash and update password
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            
            // SECURITY: Invalidate all existing tokens when password changes (database-backed)
            await incrementUserTokenVersion(user._id);
            console.log(`Security event: password_changed | UserId: ${user._id}`);
        }

        // Update name fields
        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;

        // If email is changing, check for duplicates and sync with Stripe
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ msg: 'Email is already in use' });
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
                        console.log(`Stripe customer updated | UserId: ${user._id} | CustomerId: ${user.stripeCustomerId}`);
                    }
                } catch (stripeErr) {
                    console.error(`Stripe customer update failed (non-blocking) | UserId: ${user._id} | Error: ${stripeErr.message}`);
                    // Stripe failure does not block account update
                }
            }
        }

        await user.save();

        console.log(`User action: account_updated | UserId: ${user._id} | Email: ${user.email}`);
        res.json({
            msg: 'Account updated successfully',
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                subscription: user.subscription
            }
        });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Update account | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @swagger
 * /api/auth/me:
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
router.get('/me', auth, async (req, res) => {
    try {
        // req.user is populated by the auth middleware (from middleware/auth.js)
        const user = await User.findById(req.user.id).select('-password'); // Exclude password
        if (!user) {
            console.log(`User action: profile_access_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        console.log(`User action: profile_accessed | UserId: ${req.user.id} | Email: ${user.email}`);
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
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get user profile | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @swagger
 * /api/auth/profile:
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
router.put('/profile', auth, allowOnlyFields(['firstName', 'lastName', 'phone'], true), async (req, res) => {
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

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            console.log(`User action: profile_update_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
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

        console.log(`User action: profile_updated | UserId: ${req.user.id} | Email: ${user.email}`);
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
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Profile update | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @swagger
 * /api/auth/nutrition:
 *   get:
 *     summary: Get logged-in user's nutrition logs
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nutrition logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   date:
 *                     type: string
 *                   mealType:
 *                     type: string
 *                   foodItem:
 *                     type: string
 *                   calories:
 *                     type: number
 *                   protein:
 *                     type: number
 *                   carbs:
 *                     type: number
 *                   fats:
 *                     type: number
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/nutrition', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('nutritionLogs');
        if (!user) {
            console.log(`User action: nutrition_access_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        console.log(`User action: nutrition_accessed | UserId: ${req.user.id} | Email: ${user.email}`);
        res.json(user.nutritionLogs);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get nutrition logs | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @swagger
 * /api/auth/nutrition:
 *   post:
 *     summary: Add a new meal log for the logged-in user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - date
 *               - mealType
 *               - foodItem
 *               - calories
 *               - protein
 *               - carbs
 *               - fats
 *             properties:
 *               id:
 *                 type: number
 *                 description: Unique identifier for the meal log
 *               date:
 *                 type: string
 *                 description: Date of the meal
 *               mealType:
 *                 type: string
 *                 description: Type of meal (e.g., breakfast, lunch)
 *               foodItem:
 *                 type: string
 *                 description: Name of the food item
 *               calories:
 *                 type: number
 *                 description: Calories in the food item
 *               protein:
 *                 type: number
 *                 description: Protein in grams
 *               carbs:
 *                 type: number
 *                 description: Carbohydrates in grams
 *               fats:
 *                 type: number
 *                 description: Fats in grams
 *     responses:
 *       201:
 *         description: Meal log added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 nutritionLogs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       date:
 *                         type: string
 *                       mealType:
 *                         type: string
 *                       foodItem:
 *                         type: string
 *                       calories:
 *                         type: number
 *                       protein:
 *                         type: number
 *                       carbs:
 *                         type: number
 *                       fats:
 *                         type: number
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/nutrition', auth, async (req, res) => {
    const { id, date, mealType, foodItem, calories, protein, carbs, fats } = req.body;
    if (!id || !date || !mealType || !foodItem || calories === undefined || protein === undefined || carbs === undefined || fats === undefined) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            console.log(`User action: nutrition_add_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs.push({ id, date, mealType, foodItem, calories, protein, carbs, fats });
        await user.save();

        console.log(`User action: nutrition_added | UserId: ${req.user.id} | Email: ${user.email} | MealType: ${mealType} | FoodItem: ${foodItem}`);
        res.status(201).json({ msg: 'Meal log added', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Add nutrition log | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @swagger
 * /api/auth/nutrition/{id}:
 *   delete:
 *     summary: Delete a meal log by id for the logged-in user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: Meal log ID
 *     responses:
 *       200:
 *         description: Meal log deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 nutritionLogs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       date:
 *                         type: string
 *                       mealType:
 *                         type: string
 *                       foodItem:
 *                         type: string
 *                       calories:
 *                         type: number
 *                       protein:
 *                         type: number
 *                       carbs:
 *                         type: number
 *                       fats:
 *                         type: number
 *       400:
 *         description: Invalid meal id
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/nutrition/:id', auth, async (req, res) => {
    const mealId = parseInt(req.params.id);
    if (isNaN(mealId)) {
        return res.status(400).json({ msg: 'Invalid meal id' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            console.log(`User action: nutrition_delete_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs = user.nutritionLogs.filter(meal => meal.id !== mealId);
        await user.save();

        console.log(`User action: nutrition_deleted | UserId: ${req.user.id} | Email: ${user.email} | MealId: ${mealId}`);
        res.json({ msg: 'Meal log deleted', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Delete nutrition log | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @route   GET /api/auth/schedule
 * @desc    Get logged-in user's schedule
 * @access  Private
 * @returns {Object} User's schedule object
 * @throws  {404} User not found
 * @throws  {500} Server error
 */
router.get('/schedule', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('schedule');
        if (!user) {
            console.log(`User action: schedule_access_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        console.log(`User action: schedule_accessed | UserId: ${req.user.id} | Email: ${user.email}`);
        res.json(user.schedule);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get user schedule | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @route   PUT /api/auth/schedule
 * @desc    Update logged-in user's schedule
 * @access  Private
 * @body    {Object} schedule - Schedule data object
 * @returns {Object} Success message and updated schedule object
 * @throws  {400} Schedule data is required
 * @throws  {404} User not found
 * @throws  {500} Server error
 */
router.put('/schedule', auth, async (req, res) => {
    const { schedule } = req.body;
    if (!schedule) {
        return res.status(400).json({ msg: 'Schedule data is required' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            console.log(`User action: schedule_update_failed | UserId: ${req.user.id} | Reason: User not found`);
            return res.status(404).json({ msg: 'User not found' });
        }

        user.schedule = schedule;
        await user.save();

        console.log(`User action: schedule_updated | UserId: ${req.user.id} | Email: ${user.email}`);
        res.json({ msg: 'Schedule updated successfully', schedule: user.schedule });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Update user schedule | UserId: ${req.user.id}`);
        res.status(500).send('Server Error');
    }
});

/**
 * @route   GET /api/auth/clients
 * @desc    Get all clients (Admin only)
 * @access  Private (Admin)
 * @returns {Array} Array of user objects
 * @throws  {403} Access denied: Admins only
 * @throws  {500} Server error
 */
router.get('/clients', auth, async (req, res) => {
    try {
        // Only allow admins
        if (req.user.role !== 'admin') {
            console.log(`User action: clients_access_denied | UserId: ${req.user.id} | Reason: Insufficient permissions | RequestedRole: ${req.user.role}`);
            return res.status(403).json({ msg: 'Access denied: Admins only' });
        }

        const users = await User.find().select('-password'); // Exclude password
        console.log(`User action: clients_accessed | UserId: ${req.user.id} | Email: ${req.user.email} | ClientCount: ${users.length}`);
        res.json(users);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get all clients | UserId: ${req.user.id}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// FORGOT PASSWORD ROUTE
router.post('/forgot-password', passwordResetLimiter, [
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    console.log(`Security event: forgot_password_attempt | Email: ${email}`);

    try {
        const user = await User.findOne({ email });
        if (!user) {
            // Do not reveal if user exists or not for security
            console.log(`Security event: forgot_password_failed | Email: ${email} | Reason: User not found`);
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.resetToken = resetToken;
        user.resetExpires = resetExpires;
        await user.save();

        // Send reset email via Mailjet (skip in test environment)
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
                        From: {
                            Email: 'josiah.johnson6550@gmail.com',
                            Name: 'JE Fitness'
                        },
                        To: [
                            {
                                Email: email,
                                Name: `${user.firstName} ${user.lastName}`
                            }
                        ],
                        Subject: 'Password Reset - JE Fitness',
                        TextPart: `Hi ${user.firstName},\n\nYou requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest,\nJE Fitness Team`,
                        HTMLPart: htmlPart
                    }
                ]
            });

            try {
                await request;
                console.log(`Security event: reset_email_sent | UserId: ${user._id} | Email: ${email}`);
            } catch (emailErr) {
                console.error(`Error: ${JSON.stringify(emailErr)} | Context: Reset email sending | UserId: ${user._id}`);
                return res.status(500).json({ msg: 'Error sending email. Please try again.' });
            }
            }
        }

        res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });

    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Forgot password | Email: ${email}`);
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// RESET PASSWORD ROUTE
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    console.log(`Security event: reset_password_attempt | Token: ${token ? 'provided' : 'missing'}`);

    if (!token || !password) {
        return res.status(400).json({ msg: 'Token and new password are required.' });
    }

    try {
        const user = await User.findOne({
            resetToken: token,
            resetExpires: { $gt: new Date() }
        });

        if (!user) {
            console.log(`Security event: reset_password_failed | Reason: Invalid or expired token`);
            return res.status(400).json({ msg: 'Invalid or expired reset token.' });
        }

        // SECURITY: Validate password strength before resetting
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
            return res.status(400).json({ msg: passwordError });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password and clear reset fields
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.resetExpires = undefined;
        
        // SECURITY: Invalidate all existing tokens when password is reset (database-backed)
        await incrementUserTokenVersion(user._id);
        await user.save();

        console.log(`Security event: password_reset_success | UserId: ${user._id} | Email: ${user.email}`);
        res.status(200).json({ msg: 'Password reset successfully. You can now log in with your new password.' });

    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Reset password | Token: ${token}`);
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// EMAIL VERIFICATION ROUTE
router.post('/verify-email', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'User not found.' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ msg: 'Email already verified.' });
        }

        if (!user.emailVerificationToken || user.emailVerificationToken !== otp) {
            console.log(`Security event: otp_verification_failed | UserId: ${user._id} | Email: ${email} | Reason: Invalid OTP`);
            return res.status(400).json({ msg: 'Invalid OTP.' });
        }

        if (new Date() > user.emailVerificationExpires) {
            console.log(`Security event: otp_verification_failed | UserId: ${user._id} | Email: ${email} | Reason: OTP expired`);
            return res.status(400).json({ msg: 'OTP has expired. Please request a new one.' });
        }

        // Verify the email
        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        // SECURITY: Issue JWT token with token version (from database)
        const tokenVersion = await getUserTokenVersion(user._id);
        const token = jwt.sign({ 
            id: user._id, 
            userId: user._id,
            role: user.role,
            tokenVersion 
        }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Send confirmation email via Mailjet
        const mailjetClient = getMailjetClient();
        if (mailjetClient) {
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
                            Name: `${user.firstName} ${user.lastName}`
                        }
                    ],
                    Subject: 'Welcome to JE Fitness!',
                    TextPart: `Hi ${user.firstName},\n\nThank you for signing up with JE Fitness. We're excited to have you onboard!\n\nBest,\nJE Fitness Team`,
                    HTMLPart: `<p>Hi <strong>${user.firstName}</strong>,</p>
                               <p>Thank you for signing up with JE Fitness. We're excited to have you onboard!</p>
                               <p>Best regards,<br>JE Fitness Team</p>`
                }
            ]
        });

        try {
            await request;
            console.log(`User action: confirmation_email_sent | UserId: ${user._id} | Email: ${email}`);
        } catch (emailErr) {
            console.error(`Error: ${JSON.stringify(emailErr)} | Context: Confirmation email sending after verification | UserId: ${user._id}`);
            // Do not stop verification because of email failure
        }
        }

        console.log(`User action: email_verified | UserId: ${user._id} | Email: ${email} | Role: ${user.role}`);
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

    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Email verification | Email: ${email}`);
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

/**
 * @swagger
 * /api/auth/logout:
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
router.post('/logout', auth, async (req, res) => {
    try {
        // SECURITY: Increment token version to invalidate current and all user's tokens
        // This is restart-safe as it's stored in the database
        await incrementUserTokenVersion(req.user.id);

        console.log(`Security event: logout | UserId: ${req.user.id}`);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: User logout | UserId: ${req.user.id}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
