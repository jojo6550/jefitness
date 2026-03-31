const mongoose = require('mongoose');

const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { logUserAction } = require('../services/logger');

const trainerController = {
  /**
   * Get trainer dashboard overview
   */
  getDashboard: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const now = new Date();
    const trainerObjectId = new mongoose.Types.ObjectId(trainerId);

    const statsResult = await Appointment.aggregate([
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

    const stats = statsResult[0] || {
      totalAppointments: 0,
      completedAppointments: 0,
      scheduledAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      lateAppointments: 0,
      uniqueClients: 0,
      upcomingAppointments: [],
    };

    const upcomingAppointmentsRaw = stats.upcomingAppointments
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);

    const upcomingAppointmentIds = upcomingAppointmentsRaw.map(apt => apt._id);
    const upcomingAppointments = await Appointment.find({
      _id: { $in: upcomingAppointmentIds },
    })
      .populate('clientId', 'firstName lastName email')
      .sort({ date: 1, time: 1 })
      .lean();

    const clientIds = statsResult[0]?.uniqueClients || [];
    const clients = await User.find({ _id: { $in: clientIds } })
      .select('firstName lastName email activityStatus')
      .lean();

    const completionRate =
      stats.totalAppointments > 0
        ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100)
        : 0;

    logUserAction('view_trainer_dashboard', trainerId);

    res.json({
      overview: { ...stats, completionRate },
      upcomingAppointments,
      clients,
      recentActivity: { lastUpdated: new Date() },
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
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const baseMatch = { trainerId: trainerObjectId };
    if (view === 'archive') {
      baseMatch.$or = [
        { status: 'cancelled' },
        {
          status: { $in: ['completed', 'no_show'] },
          statusUpdatedAt: { $lt: twentyFourHoursAgo },
        },
      ];
    } else {
      baseMatch.$or = [
        { status: { $in: ['scheduled', 'late'] } },
        {
          status: { $in: ['completed', 'no_show'] },
          statusUpdatedAt: { $gte: twentyFourHoursAgo },
        },
      ];
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
      .populate('clientId')
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
    if (!appointment) throw new NotFoundError('Appointment');
    if (appointment.trainerId.toString() !== req.user.id) throw new AuthorizationError();

    const { status, notes } = req.body;
    if (status) {
      appointment.status = status;
      appointment.statusUpdatedAt = new Date();
    }
    if (notes !== undefined) appointment.notes = notes;

    await appointment.save();
    await appointment.populate('clientId', 'firstName lastName email');
    await appointment.populate('trainerId', 'firstName lastName email');

    logUserAction('update_appointment', req.user.id, { appointmentId: req.params.id });
    res.json(appointment);
  }),

  /**
   * Get specific client info
   */
  getClientInfo: asyncHandler(async (req, res) => {
    const trainerId = req.user.id;
    const { clientId } = req.params;

    const client = await User.findById(clientId).select('-password');
    if (!client) throw new NotFoundError('Client');

    const appointments = await Appointment.find({ trainerId, clientId }).sort({
      date: -1,
    });

    res.json({
      client,
      appointmentHistory: appointments,
      appointmentCount: appointments.length,
      completedCount: appointments.filter(apt => apt.status === 'completed').length,
    });
  }),
};

module.exports = trainerController;
