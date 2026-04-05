const mongoose = require('mongoose');

const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { asyncHandler, NotFoundError, AuthorizationError } = require('../middleware/errorHandler');
const { logUserAction } = require('../services/logger');

const trainerController = {
  /**
   * Get authenticated trainer's info
   */
  getMe: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const trainer = await User.findById(trainerId).select('_id firstName lastName email trainerEmailPreference').lean();
    if (!trainer) throw new NotFoundError('Trainer');
    res.json({ trainerId: trainer._id, ...trainer });
  }),

  /**
   * Get trainer dashboard overview
   */
  getDashboard: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const now = new Date();
    // Validate trainerId is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(trainerId)) {
      logger.error('Invalid trainerId in dashboard', { trainerId });
      return res.status(400).json({
        overview: { totalAppointments: 0, uniqueClients: 0, upcomingAppointments: [], completionRate: 0 },
        clients: [],
        trainerEmailPreference: 'daily_digest'
      });
    }

    let stats = { totalAppointments: 0, completedAppointments: 0, scheduledAppointments: 0, cancelledAppointments: 0, noShowAppointments: 0, lateAppointments: 0, uniqueClients: 0, upcomingAppointments: [] };
    let statsResult;
    try {
      const trainerObjectId = new mongoose.Types.ObjectId(trainerId);
      statsResult = await Appointment.aggregate([
        { $match: { trainerId: trainerObjectId } },
        {
          $group: {
            _id: null,
            totalAppointments: { $sum: 1 },
            completedAppointments: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            scheduledAppointments: {
              $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] },
            },
            cancelledAppointments: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            noShowAppointments: {
              $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] },
            },
            lateAppointments: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            uniqueClients: { $addToSet: '$clientId' },
            upcomingAppointments: {
              $push: {
                $cond: [
                  { $and: [{ $gte: ['$date', now] }, { $ne: ['$status', 'cancelled'] }] },
                  {
                    date: '$date',
                    time: '$time',
                    status: '$status',
                    clientId: '$clientId',
                    _id: '$_id',
                  },
                  null,
                ],
              },
            },
          },
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
                cond: { $ne: ['$$apt', null] },
              },
            },
          },
        },
      ]);
    } catch (aggErr) {
      logger.error('Dashboard aggregation failed', { trainerId, error: aggErr.message });
    }

    const statsSafe = statsResult?.[0] || stats;

    stats = statsSafe;

    const upcomingAppointmentsRaw = stats.upcomingAppointments
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);

    const upcomingAppointmentIds = upcomingAppointmentsRaw.map(apt => apt._id);
    let upcomingAppointments = [];
    try {
      upcomingAppointments = await Appointment.find({
        _id: { $in: upcomingAppointmentIds },
      })
        .populate('clientId', 'firstName lastName email')
        .sort({ date: 1, time: 1 })
        .lean();
    } catch (populateErr) {
      logger.error('Dashboard populate upcoming failed', { trainerId, error: populateErr.message });
    }

    let clients = [];
    try {
      clients = await User.find({ _id: { $in: [] } })
        .select('firstName lastName email activityStatus')
        .lean();
    } catch (clientErr) {
      logger.error('Dashboard clients query failed', { trainerId, error: clientErr.message });
    }

    const completionRate =
      stats.totalAppointments > 0
        ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100)
        : 0;

    logUserAction('view_trainer_dashboard', trainerId);

    let trainerUser = { trainerEmailPreference: 'daily_digest' };
    try {
      trainerUser = await User.findById(trainerId).select('trainerEmailPreference').lean();
    } catch (prefErr) {
      logger.error('Dashboard trainer pref query failed', { trainerId, error: prefErr.message });
    }

    res.json({
      overview: { ...stats, completionRate },
      upcomingAppointments,
      clients,
      recentActivity: { lastUpdated: new Date() },
      trainerEmailPreference: trainerUser?.trainerEmailPreference || 'daily_digest',
    });
  }),

  /**
   * Get all clients for a trainer
   */
  getClients: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const {
      search = '',
      sortBy = 'firstName',
      sortOrder = 'asc',
      page = 1,
      limit = 10,
    } = req.query;

    const appointments = await Appointment.find({ trainerId });
    const clientIds = [...new Set(appointments.map(apt => apt.clientId.toString()))];

    const searchQuery = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const query = { _id: { $in: clientIds }, ...searchQuery };
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    const totalCount = await User.countDocuments(query);

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
        hasPrev: page > 1,
      },
    });
  }),

  /**
   * Get all appointments with filtering
   */
  getAppointments: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    let { status = '', search = '', page = 1, limit = 10, view = 'active' } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const trainerObjectId = new mongoose.Types.ObjectId(trainerId);

    const baseMatch = { trainerId: trainerObjectId };
    if (view === 'archive') {
      // All terminal statuses — anything that's been given a final outcome
      baseMatch.status = { $in: ['completed', 'no_show', 'late', 'cancelled'] };
    } else {
      // Only unresolved sessions remain in active
      baseMatch.status = 'scheduled';
    }

    if (status) baseMatch.status = status;

    const pipeline = [{ $match: baseMatch }];
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'clientId',
        foreignField: '_id',
        as: 'client',
      },
    });
    pipeline.push({ $unwind: { path: '$client', preserveNullAndEmptyArrays: true } });

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'client.firstName': searchRegex },
            { 'client.lastName': searchRegex },
            { 'client.email': searchRegex },
          ],
        },
      });
    }

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await Appointment.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    const skip = (page - 1) * limit;
    pipeline.push(
      { $sort: { date: -1, time: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
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
            email: '$client.email',
          },
          trainerId: 1,
        },
      }
    );

    const appointments = await Appointment.aggregate(pipeline);

    res.json({
      appointments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalAppointments: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  }),

  /**
   * Get single appointment
   */
  getAppointmentById: asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id)
      .populate('clientId', 'firstName lastName email phone')
      .populate('trainerId', 'firstName lastName email');

    if (!appointment) throw new NotFoundError('Appointment');
    if (appointment.trainerId._id.toString() !== req.user.id)
      throw new AuthorizationError();

    res.json(appointment);
  }),

  /**
   * Update appointment
   */
  updateAppointment: asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      logger.warn('Trainer attempted to update non-existent appointment', {
        trainerId: req.user.id,
        appointmentId: req.params.id,
        attemptedStatus: req.body.status,
        endpoint: '/api/v1/trainer/appointments/:id'
      });
      throw new NotFoundError('Appointment');
    }
    if (appointment.trainerId.toString() !== req.user.id) throw new AuthorizationError();

    const { status, notes } = req.body;
    if (status) {
      appointment.status = status;
      appointment.statusUpdatedAt = new Date();
    }
    // Append log note so history accumulates rather than getting overwritten
    if (notes !== undefined) {
      appointment.notes = appointment.notes
        ? `${appointment.notes}\n${notes}`
        : notes;
    }

    await appointment.save();
    await appointment.populate('clientId', 'firstName lastName email');
    await appointment.populate('trainerId', 'firstName lastName email');

    const actionNames = {
      completed: 'appointment_marked_on_time',
      late:      'appointment_marked_late',
      no_show:   'appointment_marked_no_show',
    };
    logUserAction(actionNames[status] || 'appointment_notes_updated', req.user.id, {
      appointmentId: req.params.id,
      clientId: appointment.clientId._id,
      clientName: `${appointment.clientId.firstName} ${appointment.clientId.lastName}`,
      date: appointment.date,
      time: appointment.time,
      status,
    });
    res.json(appointment);
  }),

  /**
   * Get specific client info (trainer must have at least one appointment with this client)
   */
  getClientInfo: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const { clientId } = req.params;

    // Verify a trainer-client relationship exists before exposing client data
    const hasRelationship = await Appointment.exists({ trainerId, clientId });
    if (!hasRelationship) throw new AuthorizationError();

    const client = await User.findById(clientId).select(
      'firstName lastName email phone dob gender activityStatus hasMedical medicalConditions medicalDocuments'
    );
    if (!client) throw new NotFoundError('Client');

    const appointments = await Appointment.find({ trainerId, clientId }).sort({ date: -1 });

    res.json({
      client,
      appointmentHistory: appointments,
      appointmentCount: appointments.length,
      completedCount: appointments.filter(apt => apt.status === 'completed').length,
    });
  }),

  /**
   * Bulk update appointment statuses
   */
  bulkUpdateAppointments: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const { appointmentIds, status } = req.body;

    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'appointmentIds array is required' });
    }

    if (!['completed', 'no_show', 'late', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    // Verify all appointments belong to this trainer
    const appointments = await Appointment.find({
      _id: { $in: appointmentIds },
      trainerId,
    });

    if (appointments.length !== appointmentIds.length) {
      throw new AuthorizationError();
    }

    const now = new Date();
    const ts = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const logNote = `[${ts}] Bulk marked as ${status.replace('_', ' ')}.`;

    // Update all appointments
    const result = await Appointment.updateMany(
      { _id: { $in: appointmentIds }, trainerId },
      {
        $set: { status, statusUpdatedAt: now },
        $push: { notes: logNote }
      }
    );

    logUserAction('appointment_bulk_status_updated', trainerId, {
      count: appointmentIds.length,
      status,
    });

    res.json({ success: true, updatedCount: result.modifiedCount });
  }),
};

module.exports = trainerController;
