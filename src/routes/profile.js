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
        const user = await User.findById(req.user.id).select('-password -role -createdAt'); // Exclude sensitive/admin fields
        if (!user) {
            return res.status(404).json({ msg: 'User profile not found' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
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

    // Build profile fields object
    const profileFields = {};
    if (firstName) profileFields.firstName = firstName;
    if (lastName) profileFields.lastName = lastName;
    if (phone) profileFields.phone = phone;
    if (dob) profileFields.dob = dob;
    if (gender) profileFields.gender = gender;
    if (activityStatus) profileFields.activityStatus = activityStatus;
    // Ensure numerical fields are parsed correctly
    if (startWeight !== undefined && startWeight !== null) profileFields.startWeight = parseFloat(startWeight);
    if (currentWeight !== undefined && currentWeight !== null) profileFields.currentWeight = parseFloat(currentWeight);
    if (goals) profileFields.goals = goals;
    if (reason) profileFields.reason = reason;
    if (profilePicture) profileFields.profilePicture = profilePicture; // Assuming this is a URL string

    try {
        let user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Prevent users from changing their role or email via this route
        // Password changes should be handled by a separate /change-password route
        if (req.body.role || req.body.email || req.body.password) {
            return res.status(400).json({ msg: 'Email, password, and role cannot be updated via this route.' });
        }

        // Update user profile
        user = await User.findOneAndUpdate(
            { _id: req.user.id }, // Find by authenticated user's ID
            { $set: profileFields },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        ).select('-password -role -createdAt'); // Exclude sensitive/admin fields from the response

        res.json({ msg: 'Profile updated successfully!', user });

    } catch (err) {
        console.error(err.message);
        // Handle potential validation errors (e.g., if a field is required and missing)
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error');
    }
});

module.exports = router;
