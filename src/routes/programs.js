const express = require('express');
const router = express.Router();
const Program = require('../models/Program');
const auth = require('../middleware/auth');

// GET /api/programs - Get all active programs
router.get('/', async (req, res) => {
    try {
        const programs = await Program.find({ isActive: true }).sort({ createdAt: -1 });
        res.json(programs);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/programs/:slug - Get program by slug
router.get('/:slug', async (req, res) => {
    try {
        const program = await Program.findOne({ slug: req.params.slug, isActive: true });
        if (!program) {
            return res.status(404).json({ msg: 'Program not found' });
        }
        res.json(program);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/programs - Create a new program (admin only)
router.post('/', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const { title, description, price, duration, level, frequency, sessionLength, slug, features } = req.body;

        const newProgram = new Program({
            title,
            description,
            price,
            duration,
            level,
            frequency,
            sessionLength,
            slug,
            features
        });

        const program = await newProgram.save();
        res.json(program);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;