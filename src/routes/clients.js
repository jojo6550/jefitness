// routes/clients.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth'); // optional if admin-only

// GET /api/clients - return all users
router.get('/', auth, async (req, res) => {
    try {
        // Optionally, restrict to admin role
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const clients = await User.find().select('-password'); // exclude passwords
        res.json(clients);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
