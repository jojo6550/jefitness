// routes/profile.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Import the authentication middleware
const User = require('../models/User'); // Your User model

// @route   GET /api/profile/me
// @desc    Get current authenticated user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        // req.user is populated by the auth middleware (from middleware/auth.js)
        // Exclude password and Mongoose's internal __v field from the response
        const user = await User.findById(req.user.id).select('-password -__v');
        if (!user) {
            return res.status(404).json({ msg: 'User profile not found.' });
        }
        res.json(user);
    } catch (err) {
        console.error('GET /api/profile/me Error:', err.message);
        res.status(500).json({ msg: 'Server Error.' }); // Ensure JSON response for errors
    }
});

// @route   PUT /api/profile/me
// @desc    Update current authenticated user's profile
// @access  Private
router.put('/me', auth, async (req, res) => {
    // Destructure fields from the request body
    const {
        firstName,
        lastName,
        phone,
        dob,
        gender,
        activityStatus,
        startWeight,
        currentWeight,
        goals,
        reason,
        profilePicture // If you add client-side handling for this
    } = req.body;

    // Build profile fields object to update
    const profileFields = {};
    // Only add to profileFields if the value is explicitly provided (not undefined)
    // This allows frontend to send only changed fields
    if (firstName !== undefined) profileFields.firstName = firstName;
    if (lastName !== undefined) profileFields.lastName = lastName;
    if (phone !== undefined) profileFields.phone = phone;
    if (dob !== undefined) profileFields.dob = dob; // Mongoose will handle Date parsing if valid format
    if (gender !== undefined) profileFields.gender = gender;
    if (activityStatus !== undefined) profileFields.activityStatus = activityStatus;
    // Handle numerical fields: convert empty string to null, otherwise parse float
    if (startWeight !== undefined) profileFields.startWeight = startWeight === null || startWeight === '' ? null : parseFloat(startWeight);
    if (currentWeight !== undefined) profileFields.currentWeight = currentWeight === null || currentWeight === '' ? null : parseFloat(currentWeight);
    if (goals !== undefined) profileFields.goals = goals;
    if (reason !== undefined) profileFields.reason = reason;
    if (profilePicture !== undefined) profileFields.profilePicture = profilePicture; // Assuming this is a URL string

    try {
        let user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }

        // IMPORTANT: Prevent users from changing their email, password, or role via this route
        if (req.body.email || req.body.password || req.body.role) {
            return res.status(400).json({ msg: 'Email, password, and role cannot be updated via this route.' });
        }

        // Update user profile
        user = await User.findOneAndUpdate(
            { _id: req.user.id }, // Find by authenticated user's ID
            { $set: profileFields },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        ).select('-password -__v'); // Exclude sensitive fields from the response

        res.json({ msg: 'Profile updated successfully!', user });

    } catch (err) {
        console.error('PUT /api/profile/me Error:', err.message);
        // Handle Mongoose validation errors (e.g., enum mismatch, required field missing)
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
        res.status(500).json({ msg: 'Server Error.' }); // Ensure JSON response for errors
    }
});

module.exports = router;
