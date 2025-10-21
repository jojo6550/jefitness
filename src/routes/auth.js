// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Client } = require('node-mailjet');
const mailjet = new Client({
  apiKey: process.env.MAILJET_API_KEY,
  apiSecret: process.env.MAILJET_SECRET_KEY
});
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth'); // Import the authentication middleware
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { logUserAction, logSecurityEvent, logError } = require('../services/logger');

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

// SIGNUP ROUTE
router.post('/signup', [
    body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password } = req.body;
    logUserAction('signup_attempt', null, { email, firstName, lastName });

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
        return res.status(400).json({ msg: passwordError });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ msg: 'User already exists.' });

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
            emailVerificationExpires: otpExpires
        });

        await newUser.save();

        // Send OTP email via Mailjet
        const request = mailjet.post('send', { version: 'v3.1' }).request({
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
                    HTMLPart: `<p>Hi <strong>${firstName}</strong>,</p>
                               <p>Your verification code is: <strong>${otp}</strong></p>
                               <p>This code will expire in 10 minutes.</p>
                               <p>Best regards,<br>JE Fitness Team</p>`
                }
            ]
        });

        try {
            await request;
            logUserAction('otp_email_sent', newUser._id, { email });
        } catch (emailErr) {
            logError(emailErr, { context: 'OTP email sending during signup', userId: newUser._id });
            // Do not stop signup because of email failure
        }

        logUserAction('signup_pending_verification', newUser._id, { email });
        res.status(201).json({
            msg: 'Signup successful! Please check your email for the verification code.',
            email: newUser.email
        });

    } catch (err) {
        logError(err, { context: 'User signup', email });
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// LOGIN ROUTE
router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    logSecurityEvent('login_attempt', null, { email });

    try {
        const user = await User.findOne({ email });
        if (!user) {
            logSecurityEvent('login_failed', null, { email, reason: 'User not found' });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Check if account is locked
        if (user.lockoutUntil && user.lockoutUntil > new Date()) {
            const remainingTime = Math.ceil((user.lockoutUntil - new Date()) / 1000 / 60); // minutes
            logSecurityEvent('login_failed', user._id, { email, reason: 'Account locked', lockoutMinutes: remainingTime });
            return res.status(423).json({ msg: `Account is locked due to too many failed attempts. Try again in ${remainingTime} minutes.` });
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            logSecurityEvent('login_failed', user._id, { email, reason: 'Email not verified' });
            return res.status(400).json({ msg: 'Please verify your email before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Increment failed login attempts
            user.failedLoginAttempts += 1;

            // Lock account after 5 failed attempts for 2 hours
            if (user.failedLoginAttempts >= 5) {
                user.lockoutUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
                logSecurityEvent('account_locked', user._id, { email, reason: 'Too many failed attempts' });
            }

            await user.save();
            logSecurityEvent('login_failed', user._id, { email, reason: 'Invalid password', attempts: user.failedLoginAttempts });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Reset failed attempts on successful login
        user.failedLoginAttempts = 0;
        user.lockoutUntil = undefined;
        user.lastLoggedIn = new Date();
        await user.save();

        // Include role in JWT payload
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        logSecurityEvent('login_success', user._id, { email, role: user.role });

        res.json({
            token,
            user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role } // Include role in response
        });
    } catch (err) {
        logError(err, { context: 'User login', email });
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET /api/auth/me
// @desc    Get logged in user's full profile details (for session check and profile preload)
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        // req.user is populated by the auth middleware (from middleware/auth.js)
        const user = await User.findById(req.user.id).select('-password'); // Exclude password
        if (!user) {
            logUserAction('profile_access_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        logUserAction('profile_accessed', req.user.id, { email: user.email });
        res.json({
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
        });
    } catch (err) {
        logError(err, { context: 'Get user profile', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update logged in user's profile information
 * @access  Private
 */
router.put('/profile', auth, async (req, res) => {
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
            logUserAction('profile_update_failed', req.user.id, { reason: 'User not found' });
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

        logUserAction('profile_updated', req.user.id, { email: user.email });
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
        logError(err, { context: 'Profile update', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

// GET /api/auth/nutrition - Get logged-in user's nutrition logs
router.get('/nutrition', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('nutritionLogs');
        if (!user) {
            logUserAction('nutrition_access_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        logUserAction('nutrition_accessed', req.user.id, { email: user.email });
        res.json(user.nutritionLogs);
    } catch (err) {
        logError(err, { context: 'Get nutrition logs', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

// POST /api/auth/nutrition - Add a new meal log
router.post('/nutrition', auth, async (req, res) => {
    const { id, date, mealType, foodItem, calories, protein, carbs, fats } = req.body;
    if (!id || !date || !mealType || !foodItem || calories === undefined || protein === undefined || carbs === undefined || fats === undefined) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            logUserAction('nutrition_add_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs.push({ id, date, mealType, foodItem, calories, protein, carbs, fats });
        await user.save();

        logUserAction('nutrition_added', req.user.id, { email: user.email, mealType, foodItem });
        res.status(201).json({ msg: 'Meal log added', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        logError(err, { context: 'Add nutrition log', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

// DELETE /api/auth/nutrition/:id - Delete a meal log by id
router.delete('/nutrition/:id', auth, async (req, res) => {
    const mealId = parseInt(req.params.id);
    if (isNaN(mealId)) {
        return res.status(400).json({ msg: 'Invalid meal id' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            logUserAction('nutrition_delete_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs = user.nutritionLogs.filter(meal => meal.id !== mealId);
        await user.save();

        logUserAction('nutrition_deleted', req.user.id, { email: user.email, mealId });
        res.json({ msg: 'Meal log deleted', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        logError(err, { context: 'Delete nutrition log', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

/**
 * @route   GET /api/auth/schedule
 * @desc    Get logged in user's schedule
 * @access  Private
 */
router.get('/schedule', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('schedule');
        if (!user) {
            logUserAction('schedule_access_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        logUserAction('schedule_accessed', req.user.id, { email: user.email });
        res.json(user.schedule);
    } catch (err) {
        logError(err, { context: 'Get user schedule', userId: req.user.id });
        res.status(500).send('Server Error');
    }
});

/**
 * @route   PUT /api/auth/schedule
 * @desc    Update logged in user's schedule
 * @access  Private
 */
router.put('/schedule', auth, async (req, res) => {
    const { schedule } = req.body;
    if (!schedule) {
        return res.status(400).json({ msg: 'Schedule data is required' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            logUserAction('schedule_update_failed', req.user.id, { reason: 'User not found' });
            return res.status(404).json({ msg: 'User not found' });
        }

        user.schedule = schedule;
        await user.save();

        logUserAction('schedule_updated', req.user.id, { email: user.email });
        res.json({ msg: 'Schedule updated successfully', schedule: user.schedule });
    } catch (err) {
        logError(err, { context: 'Update user schedule', userId: req.user.id });
        res.status(500).send('Server Error');
    }

// GET all clients (Admin only)
router.get('/clients', auth, async (req, res) => {
    try {
        // Only allow admins
        if (req.user.role !== 'admin') {
            logUserAction('clients_access_denied', req.user.id, { reason: 'Insufficient permissions', requestedRole: req.user.role });
            return res.status(403).json({ msg: 'Access denied: Admins only' });
        }

        const users = await User.find().select('-password'); // Exclude password
        logUserAction('clients_accessed', req.user.id, { email: req.user.email, clientCount: users.length });
        res.json(users);
    } catch (err) {
        logError(err, { context: 'Get all clients', userId: req.user.id });
        res.status(500).json({ msg: 'Server error' });
    }
});

});

// FORGOT PASSWORD ROUTE
router.post('/forgot-password', passwordResetLimiter, [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    logSecurityEvent('forgot_password_attempt', null, { email });

    try {
        const user = await User.findOne({ email });
        if (!user) {
            // Do not reveal if user exists or not for security
            logSecurityEvent('forgot_password_failed', null, { email, reason: 'User not found' });
            return res.status(200).json({ msg: 'If an account with that email exists, a reset link has been sent.' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.resetToken = resetToken;
        user.resetExpires = resetExpires;
        await user.save();

        // Send reset email via Mailjet
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
        const request = mailjet.post('send', { version: 'v3.1' }).request({
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
                    HTMLPart: `<p>Hi <strong>${user.firstName}</strong>,</p>
                               <p>You requested a password reset. Click the link below to reset your password:</p>
                               <p><a href="${resetUrl}">Reset Password</a></p>
                               <p>This link will expire in 10 minutes.</p>
                               <p>If you didn't request this, please ignore this email.</p>
                               <p>Best regards,<br>JE Fitness Team</p>`
                }
            ]
        });

        try {
            await request;
            logSecurityEvent('reset_email_sent', user._id, { email });
        } catch (emailErr) {
            logError(emailErr, { context: 'Reset email sending', userId: user._id });
            return res.status(500).json({ msg: 'Error sending email. Please try again.' });
        }

        res.status(200).json({ msg: 'If an account with that email exists, a reset link has been sent.' });

    } catch (err) {
        logError(err, { context: 'Forgot password', email });
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// RESET PASSWORD ROUTE
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    logSecurityEvent('reset_password_attempt', null, { token: token ? 'provided' : 'missing' });

    if (!token || !password) {
        return res.status(400).json({ msg: 'Token and new password are required.' });
    }

    try {
        const user = await User.findOne({
            resetToken: token,
            resetExpires: { $gt: new Date() }
        });

        if (!user) {
            logSecurityEvent('reset_password_failed', null, { reason: 'Invalid or expired token' });
            return res.status(400).json({ msg: 'Invalid or expired reset token.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password and clear reset fields
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.resetExpires = undefined;
        await user.save();

        logSecurityEvent('password_reset_success', user._id, { email: user.email });
        res.status(200).json({ msg: 'Password reset successfully. You can now log in with your new password.' });

    } catch (err) {
        logError(err, { context: 'Reset password', token });
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
            logSecurityEvent('otp_verification_failed', user._id, { email, reason: 'Invalid OTP' });
            return res.status(400).json({ msg: 'Invalid OTP.' });
        }

        if (new Date() > user.emailVerificationExpires) {
            logSecurityEvent('otp_verification_failed', user._id, { email, reason: 'OTP expired' });
            return res.status(400).json({ msg: 'OTP has expired. Please request a new one.' });
        }

        // Verify the email
        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        // Issue JWT token
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Send confirmation email via Mailjet
        const request = mailjet.post('send', { version: 'v3.1' }).request({
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
            logUserAction('confirmation_email_sent', user._id, { email });
        } catch (emailErr) {
            logError(emailErr, { context: 'Confirmation email sending after verification', userId: user._id });
            // Do not stop verification because of email failure
        }

        logUserAction('email_verified', user._id, { email, role: user.role });
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
        logError(err, { context: 'Email verification', email });
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

module.exports = router;
