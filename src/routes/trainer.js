const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { auth, requireTrainer } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');

const { logger, logAdminAction, logUserAction } = require('../services/logger');

/**
 * @route   GET /api/trainer/dashboard
 * @desc    Get trainer dashboard overview with key metrics
 * @access  Private (Trainer only)
 * @returns {Object} Dashboard metrics including clients, appointments, and statistics
 * @throws  {403} Access denied if not trainer
 * @throws  {500} Server error
 */
router.get('/dashboard', auth, requireTrainer, async (req, res) => {
    try {
        const trainerId = req.user.id;
        const now = new Date();

        // Use aggregation pipeline for efficient stats calculation
        const statsResult = await Appointment.aggregate([
            { $match: { trainerId: mongoose.Types.ObjectId(trainerId) } },
            {
                $group: {
                    _id: null,
                    totalAppointments: { $sum: 1 },
                    completedAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    scheduledAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] }
                    },
                    cancelledAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    noShowAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] }
                    },
                    lateAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                    },
                    uniqueClients: { $addToSet: '$clientId' },
                    upcomingAppointments: {
                        $push: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ['$date', now] },
                                        { $ne: ['$status', 'cancelled'] }
                                    ]
                                },
                                {
                                    date: '$date',
                                    time: '$time',
                                    status: '$status',
                                    clientId: '$clientId',
                                    _id: '$_id'
                                },
                                null
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    totalAppointments: 1,
                    completedAppointments: 1,
                    scheduledAppointments: 1,
                    cancelledAppointments: 1,
                    noShowAppointments: 1,
                    lateAppointments: 1,
                    uniqueClients: { $size: '$uniqueClients' },
                    upcomingAppointments: {
                        $filter: {
                            input: '$upcomingAppointments',
                            as: 'apt',
                            cond: { $ne: ['$$apt', null] }
                        }
                    }
                }
            }
        ]);

        const stats = statsResult[0] || {
            totalAppointments: 0,
            completedAppointments: 0,
            scheduledAppointments: 0,
            cancelledAppointments: 0,
            noShowAppointments: 0,
            lateAppointments: 0,
            uniqueClients: 0,
            upcomingAppointments: []
        };

        // Get upcoming appointments with client details (limit to 5)
        const upcomingAppointmentsRaw = stats.upcomingAppointments
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);

        const upcomingAppointmentIds = upcomingAppointmentsRaw.map(apt => apt._id);
        const upcomingAppointments = await Appointment.find({ _id: { $in: upcomingAppointmentIds } })
            .populate('clientId', 'firstName lastName email')
            .sort({ date: 1, time: 1 })
            .lean();

        // Get client details
        const clientIds = statsResult[0]?.uniqueClients || [];
        const clients = await User.find({ _id: { $in: clientIds } })
            .select('firstName lastName email activityStatus')
            .lean();

        // Calculate completion rate
        const completionRate = stats.totalAppointments > 0
            ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100)
            : 0;

        logUserAction('view_trainer_dashboard', trainerId);

        res.json({
            overview: {
                totalClients: stats.uniqueClients,
                totalAppointments: stats.totalAppointments,
                completedAppointments: stats.completedAppointments,
                scheduledAppointments: stats.scheduledAppointments,
                cancelledAppointments: stats.cancelledAppointments,
                noShowAppointments: stats.noShowAppointments,
                lateAppointments: stats.lateAppointments,
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
router.get('/clients', auth, requireTrainer, requireActiveSubscription, async (req, res) => {
    try {
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

        // Build aggregation pipeline
        const pipeline = [
            { $match: { trainerId: mongoose.Types.ObjectId(trainerId) } }
        ];

        // Add status filter
        if (status) {
            pipeline.push({ $match: { status } });
        }

        // Add lookup for client details
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'clientId',
                foreignField: '_id',
                as: 'client'
            }
        });

        pipeline.push({ $unwind: '$client' });

        // Add search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { 'client.firstName': searchRegex },
                        { 'client.lastName': searchRegex },
                        { 'client.email': searchRegex }
                    ]
                }
            });
        }

        // Get total count
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Appointment.aggregate(countPipeline);
        const totalCount = countResult[0]?.total || 0;

        // Add sorting and pagination
        const skip = (page - 1) * limit;
        pipeline.push(
            { $sort: { date: -1, time: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        // Project final result
        pipeline.push({
            $project: {
                _id: 1,
                date: 1,
                time: 1,
                status: 1,
                notes: 1,
                createdAt: 1,
                updatedAt: 1,
                clientId: {
                    _id: '$client._id',
                    firstName: '$client.firstName',
                    lastName: '$client.lastName',
                    email: '$client.email'
                },
                trainerId: 1
            }
        });

        // Execute aggregation
        const appointments = await Appointment.aggregate(pipeline);

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
router.get('/appointments/:id', auth, requireTrainer, async (req, res) => {
    try {
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
router.put('/appointments/:id', auth, requireTrainer, async (req, res) => {
    try {
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
router.get('/client/:clientId', auth, requireTrainer, async (req, res) => {
    try {
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