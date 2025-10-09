const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/users/trainers - Get all trainers
router.get('/trainers', auth, async (req, res) => {
    try {
        const trainers = await User.find({
            role: 'admin',
            $or: [
                { firstName: { $ne: 'admin' } },
                { lastName: { $ne: 'admin' } }
            ]
        }).select('firstName lastName email');
        res.json(trainers);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
