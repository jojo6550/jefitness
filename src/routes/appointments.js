const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { logger, logError, logAdminAction, logUserAction } = require('../services/logger');

// GET /api/appointments - Get all appointments (admin only) with pagination and filtering
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const {
            page = 1,
            limit = 10,
            search = '',
            sortBy = 'date',
            sortOrder = 'asc',
            status = ''
        } = req.query;

        // Build filter object
        let filter = {};

        // Add status filter
        if (status) {
            filter.status = status;
        }

        // Add search filter (search in client and trainer names)
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { 'clientId.firstName': searchRegex },
                { 'clientId.lastName': searchRegex },
                { 'trainerId.firstName': searchRegex },
                { 'trainerId.lastName': searchRegex }
            ];
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalAppointments = await Appointment.countDocuments(filter);

        // Get appointments with pagination
        const appointments = await Appointment.find(filter)
            .populate('clientId', 'firstName lastName email')
            .populate('trainerId', 'firstName lastName email')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Calculate pagination info
        const totalPages = Math.ceil(totalAppointments / limit);
        const pagination = {
            currentPage: parseInt(page),
            totalPages,
            totalAppointments,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };

        // Log admin action
        logAdminAction('view_all_appointments', req.user.id, { query: req.query });

        res.json({
            appointments,
            pagination
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/appointments/user - Get user's appointments
router.get('/user', auth, async (req, res) => {
    try {
        const appointments = await Appointment.find({
            $or: [
                { clientId: req.user.id },
                { trainerId: req.user.id }
            ]
        })
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

        // Check the 10-client limit per 1:30 min period
        const appointmentDate = new Date(date);
        const requestedTime = new Date(`${date}T${time}`);
        const timeSlotEnd = new Date(requestedTime.getTime() + 90 * 60 * 1000); // 1:30 hours later

        const existingAppointments = await Appointment.find({
            trainerId,
            date: appointmentDate,
            $or: [
                { time: { $gte: time, $lt: timeSlotEnd.toTimeString().slice(0, 5) } },
                { time: { $lte: time, $gte: new Date(timeSlotEnd.getTime() - 90 * 60 * 1000).toTimeString().slice(0, 5) } }
            ],
            status: { $ne: 'cancelled' }
        });

        if (existingAppointments.length >= 10) {
            return res.status(400).json({ msg: 'Time slot is fully booked (maximum 10 clients per 1:30 min period)' });
        }

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
        logUserAction('book_appointment', req.user.id, { appointmentId: appointment._id, trainerId, date, time });

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

        // Log the action
        if (appointment.clientId.toString() === req.user.id && status === 'cancelled') {
            logUserAction('cancel_appointment', req.user.id, { appointmentId: req.params.id });
        } else {
            logAdminAction('update_appointment', req.user.id, { appointmentId: req.params.id, updates: req.body });
        }

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

        // Allow delete if user is admin, trainer, or client
        if (req.user.role !== 'admin' && appointment.trainerId.toString() !== req.user.id && appointment.clientId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        // Log action
        if (appointment.clientId.toString() === req.user.id) {
            logUserAction('delete_appointment', req.user.id, { appointmentId: req.params.id });
        } else {
            logAdminAction('delete_appointment', req.user.id, { appointmentId: req.params.id });
        }

        await Appointment.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Appointment deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
