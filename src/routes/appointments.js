const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/appointments - Get all appointments (admin only)
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const appointments = await Appointment.find()
            .populate('clientId', 'firstName lastName email')
            .populate('trainerId', 'firstName lastName email')
            .sort({ date: 1, time: 1 });

        res.json(appointments);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/appointments/:id - Get specific appointment
router.get('/:id', auth, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('clientId', 'firstName lastName email')
            .populate('trainerId', 'firstName lastName email');

        if (!appointment) {
            return res.status(404).json({ msg: 'Appointment not found' });
        }

        // Allow access if user is admin, client, or trainer
        if (req.user.role !== 'admin' &&
            appointment.clientId._id.toString() !== req.user.id &&
            appointment.trainerId._id.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        res.json(appointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/appointments - Create new appointment
router.post('/', auth, async (req, res) => {
    try {
        const { trainerId, date, time, notes } = req.body;

        // Validate required fields
        if (!trainerId || !date || !time) {
            return res.status(400).json({ msg: 'Please provide all required fields' });
        }

        // Check if trainer exists and is admin
        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'admin') {
            return res.status(400).json({ msg: 'Invalid trainer' });
        }

        // Set clientId from authenticated user
        const clientId = req.user.id;

        // Create appointment
        const appointment = new Appointment({
            clientId,
            trainerId,
            date,
            time,
            notes
        });

        await appointment.save();
        await appointment.populate('clientId', 'firstName lastName email');
        await appointment.populate('trainerId', 'firstName lastName email');

        // Log the successful booking
        const { logger } = require('../services/logger');
        logger.info(`Appointment booked successfully: Client ${appointment.clientId.firstName} ${appointment.clientId.lastName} with Trainer ${appointment.trainerId.firstName} ${appointment.trainerId.lastName} on ${appointment.date} at ${appointment.time}`);

        res.status(201).json(appointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// PUT /api/appointments/:id - Update appointment
router.put('/:id', auth, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({ msg: 'Appointment not found' });
        }

        // Allow update if user is admin or trainer
        if (req.user.role !== 'admin' && appointment.trainerId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const { date, time, status, notes } = req.body;

        // Update fields
        if (date) appointment.date = date;
        if (time) appointment.time = time;
        if (status) appointment.status = status;
        if (notes !== undefined) appointment.notes = notes;

        await appointment.save();
        await appointment.populate('clientId', 'firstName lastName email');
        await appointment.populate('trainerId', 'firstName lastName email');

        res.json(appointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// DELETE /api/appointments/:id - Delete appointment
router.delete('/:id', auth, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({ msg: 'Appointment not found' });
        }

        // Allow delete if user is admin or trainer
        if (req.user.role !== 'admin' && appointment.trainerId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        await Appointment.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Appointment deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
