const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/nutrition - Get user's nutrition logs
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('nutritionLogs');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json({ nutritionLogs: user.nutritionLogs || [] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/nutrition - Add a new nutrition log
router.post('/', auth, async (req, res) => {
    try {
        const { date, mealType, foodItem, calories, protein, carbs, fats } = req.body;

        // Validation
        if (!date || !mealType || !foodItem || calories === undefined || protein === undefined || carbs === undefined || fats === undefined) {
            return res.status(400).json({ msg: 'All fields are required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Generate unique id for the log
        const id = Date.now().toString();

        const newLog = {
            id,
            date,
            mealType,
            foodItem,
            calories: parseFloat(calories),
            protein: parseFloat(protein),
            carbs: parseFloat(carbs),
            fats: parseFloat(fats)
        };

        user.nutritionLogs.push(newLog);
        await user.save();

        res.status(201).json({ msg: 'Nutrition log added successfully', log: newLog });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// PUT /api/nutrition/:id - Update a nutrition log
router.put('/:id', auth, async (req, res) => {
    try {
        const { date, mealType, foodItem, calories, protein, carbs, fats } = req.body;

        // Validation
        if (!date || !mealType || !foodItem || calories === undefined || protein === undefined || carbs === undefined || fats === undefined) {
            return res.status(400).json({ msg: 'All fields are required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const logIndex = user.nutritionLogs.findIndex(log => log.id === req.params.id);
        if (logIndex === -1) {
            return res.status(404).json({ msg: 'Nutrition log not found' });
        }

        user.nutritionLogs[logIndex] = {
            ...user.nutritionLogs[logIndex],
            date,
            mealType,
            foodItem,
            calories: parseFloat(calories),
            protein: parseFloat(protein),
            carbs: parseFloat(carbs),
            fats: parseFloat(fats)
        };

        await user.save();

        res.json({ msg: 'Nutrition log updated successfully', log: user.nutritionLogs[logIndex] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// DELETE /api/nutrition/:id - Delete a nutrition log
router.delete('/:id', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const logIndex = user.nutritionLogs.findIndex(log => log.id === req.params.id);
        if (logIndex === -1) {
            return res.status(404).json({ msg: 'Nutrition log not found' });
        }

        user.nutritionLogs.splice(logIndex, 1);
        await user.save();

        res.json({ msg: 'Nutrition log deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
