const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { logger, logAdminAction, logUserAction } = require('../services/logger');

/**
 * @route   GET /api/trainer/dashboard
 * @desc    Get trainer dashboard overview with key metrics
 * @access  Private (Trainer only)
 * @returns {Object} Dashboard metrics including clients, appointments, and statistics
 * @throws  {403} Access denied if not trainer
 * @throws  {500} Server error
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const trainerId = req.user.id;

        // Get all appointments for this trainer
        const allAppointments = await Appointment.find({ trainerId })
            .populate('clientId', 'firstName lastName email');

        // Get upcoming appointments
        const now = new Date();
        const upcomingAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.date);
            return aptDate >= now && apt.status !== 'cancelled';
        }).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);

        // Get completed appointments
        const completedAppointments = allAppointments.filter(apt => apt.status === 'completed');

        // Get unique clients
        const clientIds = new Set(allAppointments.map(apt => apt.clientId._id.toString()));
        const uniqueClientsCount = clientIds.size;

        // Get client details
        const clients = await User.find({ _id: { $in: Array.from(clientIds) } })
            .select('firstName lastName email activityStatus');

        // Calculate appointment statistics
        const totalAppointments = allAppointments.length;
        const scheduledAppointments = allAppointments.filter(apt => apt.status === 'scheduled').length;
        const cancelledAppointments = allAppointments.filter(apt => apt.status === 'cancelled').length;

        // Calculate completion rate
        const completionRate = totalAppointments > 0 
            ? Math.round((completedAppointments.length / totalAppointments) * 100) 
            : 0;

        logUserAction('view_trainer_dashboard', trainerId);

        res.json({
            overview: {
                totalClients: uniqueClientsCount,
                totalAppointments,
                completedAppointments: completedAppointments.length,
                scheduledAppointments,
                cancelledAppointments,
                noShowAppointments,
                lateAppointments,
                completionRate
            },
            upcomingAppointments,
            clients,
            recentActivity: {
                lastUpdated: new Date()
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

/**
 * @route   GET /api/trainer/clients
 * @desc    Get all clients assigned to this trainer
 * @access  Private (Trainer only)
 * @query   {string} search - Search term for client names
 * @query   {string} sortBy - Field to sort by (default: 'firstName')
 * @query   {string} sortOrder - Sort order 'asc' or 'desc' (default: 'asc')
 * @query   {number} page - Page number for pagination (default: 1)
 * @query   {number} limit - Number of clients per page (default: 10)
 * @returns {Object} Array of clients with pagination info
 * @throws  {403} Access denied if not trainer
 * @throws  {500} Server error
 */
router.get('/clients', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const trainerId = req.user.id;
        const {
            search = '',
            sortBy = 'firstName',
            sortOrder = 'asc',
            page = 1,
            limit = 10
        } = req.query;

        // Get all appointments for this trainer
        const appointments = await Appointment.find({ trainerId });

        // Get unique client IDs
        const clientIds = [...new Set(appointments.map(apt => apt.clientId.toString()))];

        // Build search query
        const searchQuery = search ? {
            $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        } : {};

        // Combine queries
        const query = { _id: { $in: clientIds }, ...searchQuery };

        // Calculate pagination
        const skip = (page - 1) * limit;
        const sortDirection = sortOrder === 'desc' ? -1 : 1;

        // Get total count for pagination
        const totalCount = await User.countDocuments(query);

        // Get clients with pagination and sorting
        const clients = await User.find(query)
            .select('firstName lastName email activityStatus')
            .sort({ [sortBy]: sortDirection })
            .skip(skip)
            .limit(parseInt(limit));

        res.json({
            clients,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalClients: totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

/**
 * @route   GET /api/trainer/appointments
 * @desc    Get all appointments for this trainer with filtering and pagination
 * @access  Private (Trainer only)
 * @query   {string} status - Filter by appointment status
 * @query   {string} search - Search term for client names
 * @query   {number} page - Page number for pagination (default: 1)
 * @query   {number} limit - Number of appointments per page (default: 10)
 * @returns {Object} Array of appointments with pagination info
 * @throws  {403} Access denied if not trainer
 * @throws  {500} Server error
 */
router.get('/appointments', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const trainerId = req.user.id;
        const {
            status = '',
            search = '',
            page = 1,
            limit = 10
        } = req.query;

        // Build filter object
        let filter = { trainerId };

        // Add status filter
        if (status) {
            filter.status = status;
        }

        // Add search filter (search in client names)
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            // Find client IDs that match the search
            const matchingClients = await User.find({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { email: searchRegex }
                ]
            }).select('_id');

            const clientIds = matchingClients.map(client => client._id);
            filter.clientId = { $in: clientIds };
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalCount = await Appointment.countDocuments(filter);

        // Get appointments with pagination
        const appointments = await Appointment.find(filter)
            .populate('clientId', 'firstName lastName email')
            .sort({ date: -1, time: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.json({
            appointments,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalAppointments: totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

/**
 * @route   GET /api/trainer/appointments/:id
 * @desc    Get detailed view of a specific appointment
 * @access  Private (Trainer only)
 * @param   {string} id - Appointment ID
 * @returns {Object} Appointment object with client details
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Appointment not found
 * @throws  {500} Server error
 */
router.get('/appointments/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const appointment = await Appointment.findById(req.params.id)
            .populate('clientId')
            .populate('trainerId', 'firstName lastName email');

        if (!appointment) {
            return res.status(404).json({ msg: 'Appointment not found' });
        }

        // Ensure this trainer owns the appointment
        if (appointment.trainerId._id.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        res.json(appointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

/**
 * @route   PUT /api/trainer/appointments/:id
 * @desc    Update appointment status or notes
 * @access  Private (Trainer only)
 * @param   {string} id - Appointment ID
 * @body    {string} [status] - Updated appointment status
 * @body    {string} [notes] - Updated appointment notes
 * @returns {Object} Updated appointment object
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Appointment not found
 * @throws  {500} Server error
 */
router.put('/appointments/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({ msg: 'Appointment not found' });
        }

        // Ensure this trainer owns the appointment
        if (appointment.trainerId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const { status, notes } = req.body;

        // Update fields
        if (status) appointment.status = status;
        if (notes !== undefined) appointment.notes = notes;

        await appointment.save();
        await appointment.populate('clientId', 'firstName lastName email');
        await appointment.populate('trainerId', 'firstName lastName email');

        logUserAction('update_appointment', req.user.id, { appointmentId: req.params.id });

        res.json(appointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

/**
 * @route   GET /api/trainer/client/:clientId
 * @desc    Get detailed info for a specific client
 * @access  Private (Trainer only)
 * @param   {string} clientId - Client ID
 * @returns {Object} Client details with appointment history
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Client not found
 * @throws  {500} Server error
 */
router.get('/client/:clientId', auth, async (req, res) => {
    try {
        if (req.user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const trainerId = req.user.id;
        const { clientId } = req.params;

        // Get client details
        const client = await User.findById(clientId).select('-password');

        if (!client) {
            return res.status(404).json({ msg: 'Client not found' });
        }

        // Get appointment history for this trainer and client
        const appointments = await Appointment.find({
            trainerId,
            clientId
        }).sort({ date: -1 });

        res.json({
            client,
            appointmentHistory: appointments,
            appointmentCount: appointments.length,
            completedCount: appointments.filter(apt => apt.status === 'completed').length
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;