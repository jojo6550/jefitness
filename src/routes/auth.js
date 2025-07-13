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
            password: hashedPassword
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
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

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({
            token,
            user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email }
        });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET /api/auth/me
// @desc    Get logged in user's basic details (for session check)
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
            // You can add other basic fields you want to expose, but avoid sensitive ones
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
