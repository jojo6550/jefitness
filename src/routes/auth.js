// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth'); // Import the authentication middleware

// SIGNUP ROUTE
router.post('/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    console.log('Received signup:', req.body);

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
            console.log(`Confirmation email sent to ${email}`);
        } catch (emailErr) {
            console.error('Email sending error:', emailErr.message);
            // Do not stop signup because of email failure
        }

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
        console.error('Signup Error:', err.message);
        res.status(500).json({ msg: 'Server error. Please try again.' });
    }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'Missing fields' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        // Include role in JWT payload
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({
            token,
            user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role } // Include role in response
        });
    } catch (err) {
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
            return res.status(404).json({ msg: 'User not found' });
        }
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
        console.error(err.message);
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
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET /api/auth/nutrition - Get logged-in user's nutrition logs
router.get('/nutrition', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('nutritionLogs');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user.nutritionLogs);
    } catch (err) {
        console.error(err.message);
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
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs.push({ id, date, mealType, foodItem, calories, protein, carbs, fats });
        await user.save();

        res.status(201).json({ msg: 'Meal log added', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        console.error(err.message);
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
            return res.status(404).json({ msg: 'User not found' });
        }

        user.nutritionLogs = user.nutritionLogs.filter(meal => meal.id !== mealId);
        await user.save();

        res.json({ msg: 'Meal log deleted', nutritionLogs: user.nutritionLogs });
    } catch (err) {
        console.error(err.message);
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
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user.schedule);
    } catch (err) {
        console.error(err.message);
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
            return res.status(404).json({ msg: 'User not found' });
        }

        user.schedule = schedule;
        await user.save();

        res.json({ msg: 'Schedule updated successfully', schedule: user.schedule });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

// GET all clients (Admin only)
router.get('/clients', auth, async (req, res) => {
    try {
        // Only allow admins
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied: Admins only' });
        }

        const users = await User.find().select('-password'); // Exclude password
        res.json(users);
    } catch (err) {
        console.error('Get Clients Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

});

module.exports = router;
