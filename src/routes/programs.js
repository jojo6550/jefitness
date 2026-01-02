const express = require('express');
const router = express.Router();
const Program = require('../models/Program');
const User = require('../models/User');
const auth = require('../middleware/auth');

// 1. Marketplace Listing - Published programs only, preview fields only
// GET /api/programs/marketplace
router.get('/marketplace', async (req, res) => {
    try {
        const programs = await Program.find({ isPublished: true, isActive: true })
            .select('title description preview price duration level slug')
            .sort({ createdAt: -1 });
        res.json(programs);
    } catch (err) {
        console.error('Marketplace List Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// 2. Marketplace Program Detail - Day names only, no exercises
// GET /api/programs/marketplace/:id
router.get('/marketplace/:id', async (req, res) => {
    try {
        const program = await Program.findOne({ _id: req.params.id, isPublished: true, isActive: true })
            .select('title description preview price duration level slug days.dayName');
        
        if (!program) {
            return res.status(404).json({ msg: 'Program not found or not available in marketplace' });
        }

        res.json(program);
    } catch (err) {
        console.error('Marketplace Detail Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// 3. My Programs - Only programs assigned to the user
// GET /api/programs/my
router.get('/my', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('assignedPrograms.programId');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Filter out any potential nulls if a program was deleted
        const myPrograms = user.assignedPrograms
            .filter(ap => ap.programId)
            .map(ap => ap.programId);

        res.json(myPrograms);
    } catch (err) {
        console.error('My Programs Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// 4. Full Program Detail - Full workout content, requires assignment verification
// GET /api/programs/:id
router.get('/:id', auth, async (req, res) => {
    try {
        // Admin bypass for debugging/management
        const isAdmin = req.user.role === 'admin';
        
        if (!isAdmin) {
            const user = await User.findById(req.user.id);
            const isAssigned = user.assignedPrograms.some(ap => ap.programId.toString() === req.params.id);
            
            if (!isAssigned) {
                return res.status(403).json({ msg: 'Access denied: You are not assigned to this program' });
            }
        }

        const program = await Program.findById(req.params.id);
        if (!program) return res.status(404).json({ msg: 'Program not found' });

        res.json(program);
    } catch (err) {
        console.error('Full Program Detail Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Admin Route: Create program (Keeping existing admin capability)
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
        
        const newProgram = new Program(req.body);
        const program = await newProgram.save();
        res.json(program);
    } catch (err) {
        console.error('Admin Create Program Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;