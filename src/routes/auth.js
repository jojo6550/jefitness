// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth'); // Import the authentication middleware
const { logUserAction, logSecurityEvent, logError } = require('../services/logger');

// SIGNUP ROUTE
router.post('/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    logUserAction('signup_attempt', null, { email, firstName, lastName });

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ msg: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ msg: 'User already exists.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role: 'user' // Default new signups to 'user' role
        });

        await newUser.save();

        // Include role in JWT payload
        const token = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        });

        // Send confirmation email using SendGrid
        const transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
                user: 'apikey', // Must be this literal string
                pass: process.env.SENDGRID_API_KEY,
            },
        });

        const mailOptions = {
            from: '"JE Fitness" <josiah.johnson6550@gmail.com>',
            to: email,
            subject: 'Welcome to JE Fitness!',
            text: `Hi ${firstName},\n\nThank you for signing up with JE Fitness. We're excited to have you onboard!\n\nBest,\nJE Fitness Team`,
            html: `<p>Hi <strong>${firstName}</strong>,</p>
                   <p>Thank you for signing up with JE Fitness. We're excited to have you onboard!</p>
                   <p>Best regards,<br>JE Fitness Team</p>`,
        };

        try {
            await transporter.sendMail(mailOptions);
            logUserAction('signup_email_sent', newUser._id, { email });
        } catch (emailErr) {
            logError(emailErr, { context: 'Email sending during signup', userId: newUser._id });
            // Do not stop signup because of email failure
        }

        logUserAction('signup_success', newUser._id, { email, role: newUser.role });
        res.status(201).json({
            msg: 'Signup successful!',
            token,
            user: {
                id: newUser._id,
                name: `${newUser.firstName} ${newUser.lastName}`,
                email: newUser.email,
                role: newUser.role // Include role in response
            },
        });

    } catch (err) {
        logError(err, { context: 'User signup', email });
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    logSecurityEvent('login_attempt', null, { email });

    if (!email || !password) {
        logSecurityEvent('login_failed', null, { email, reason: 'Missing fields' });
        return res.status(400).json({ msg: 'Missing fields' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            logSecurityEvent('login_failed', null, { email, reason: 'User not found' });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logSecurityEvent('login_failed', user._id, { email, reason: 'Invalid password' });
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // Update lastLoggedIn timestamp
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

module.exports = router;
