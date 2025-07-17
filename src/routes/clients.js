// routes/clients.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // General authentication middleware
const adminAuth = require('../middleware/adminAuth'); // Admin specific authorization middleware
const User = require('../models/User'); // Your User model

// @route   GET /api/clients
// @desc    Get all clients (users with role 'user')
// @access  Private (Admin Only)
router.get('/', auth, adminAuth, async (req, res) => {
    try {
        // Fetch all users with the 'user' role
        const clients = await User.find({ role: 'user' }).select('-password'); // Exclude passwords
        res.json({ clients });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/clients
// @desc    Add a new client (user with role 'user')
// @access  Private (Admin Only)
router.post('/', auth, adminAuth, async (req, res) => {
    const { firstName, lastName, email, phone, dob, gender, activityStatus, startWeight, currentWeight, goals, reason } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !activityStatus) {
        return res.status(400).json({ msg: 'First Name, Last Name, Email, and Activity Status are required.' });
    }

    try {
        let client = await User.findOne({ email });
        if (client) {
            return res.status(400).json({ msg: 'A client with this email already exists.' });
        }

        // For new client creation by admin, a password is not strictly required initially
        // or could be set to a temporary default/random password and forced reset.
        // For simplicity, we'll create without a password here, but you might want to add one.
        client = new User({
            firstName,
            lastName,
            email,
            phone,
            dob,
            gender,
            activityStatus,
            startWeight,
            currentWeight,
            goals,
            reason,
            role: 'user' // Ensure new clients added by admin are 'user' role
            // password: 'some_default_or_random_password_hashed' // Consider adding this
        });

        await client.save();
        res.status(201).json({ msg: 'Client added successfully!', client: client.toObject({ getters: true, virtuals: false, transform: (doc, ret) => { delete ret.password; return ret; } }) }); // Return client without password
    } catch (err) {
        console.error(err.message);
        // Handle duplicate email error specifically if not caught by findOne
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Email already registered.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/clients/:id
// @desc    Update client details
// @access  Private (Admin Only)
router.put('/:id', auth, adminAuth, async (req, res) => {
    const { firstName, lastName, email, phone, dob, gender, activityStatus, startWeight, currentWeight, goals, reason } = req.body;

    const clientFields = {
        firstName, lastName, email, phone, dob, gender, activityStatus, startWeight, currentWeight, goals, reason
    };

    try {
        let client = await User.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ msg: 'Client not found' });
        }

        // Prevent admin from accidentally changing their own role or another admin's role here
        // If the client being edited is an admin, prevent modification via this route
        if (client.role === 'admin' && client._id.toString() !== req.user.id) {
             return res.status(403).json({ msg: 'Cannot modify another administrator via this route.' });
        }
        // Also ensure an admin cannot change a user's role to admin via this form
        if (req.body.role && req.body.role === 'admin' && client.role !== 'admin') {
            return res.status(403).json({ msg: 'Cannot promote user to admin via client update. Use a dedicated admin promotion tool.' });
        }


        // Find and update the client, ensuring they remain a 'user' role
        client = await User.findOneAndUpdate(
            { _id: req.params.id, role: 'user' }, // Only allow updating 'user' roles
            { $set: clientFields },
            { new: true, runValidators: true }
        ).select('-password'); // Exclude password from response

        if (!client) {
            return res.status(404).json({ msg: 'Client not found or is not a standard user account.' });
        }

        res.json({ msg: 'Client updated successfully!', client });
    } catch (err) {
        console.error(err.message);
        // Handle duplicate email error specifically
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Email already registered for another client.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/clients/:id
// @desc    Delete a client
// @access  Private (Admin Only)
router.delete('/:id', auth, adminAuth, async (req, res) => {
    try {
        const client = await User.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ msg: 'Client not found' });
        }

        // Prevent admin from deleting themselves or another admin via this route
        if (client.role === 'admin') {
            return res.status(403).json({ msg: 'Cannot delete an administrator via this route.' });
        }

        await User.findOneAndDelete({ _id: req.params.id, role: 'user' }); // Only delete 'user' roles

        res.json({ msg: 'Client removed successfully!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
