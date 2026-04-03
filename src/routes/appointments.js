const express = require('express');

const router = express.Router();
const Appointment = require('../models/Appointment');
const TrainerAvailability = require('../models/TrainerAvailability');
const User = require('../models/User');
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { logger, logError, logAdminAction, logUserAction } = require('../services/logger');
const { allowOnlyFields } = require('../middleware/inputValidator');

/**
 * @route   GET /api/appointments
 * @desc    Get all appointments with pagination and filtering (admin only)
 * @access  Private (Admin only)
 * @query   {number} page - Page number for pagination (default: 1)
 * @query   {number} limit - Number of appointments per page (default: 10)
 * @query   {string} search - Search term for client/trainer names
 * @query   {string} sortBy - Field to sort by (default: 'date')
 * @query   {string} sortOrder - Sort order 'asc' or 'desc' (default: 'asc')
 * @query   {string} status - Filter by appointment status
 * @returns {Object} appointments - Array of appointments with pagination info
 * @returns {Object} pagination - Pagination metadata
 * @throws  {403} Access denied if not admin
 * @throws  {500} Server error
 */
router.get('/', async (req, res) => {
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
      status = '',
    } = req.query;

    // Build aggregation pipeline
    const pipeline = [];

    // Add status filter
    if (status) {
      pipeline.push({ $match: { status } });
    }

    // Add lookups for client and trainer details
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'clientId',
          foreignField: '_id',
          as: 'client',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'trainerId',
          foreignField: '_id',
          as: 'trainer',
        },
      }
    );

    pipeline.push({ $unwind: '$client' }, { $unwind: '$trainer' });

    // Add search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'client.firstName': searchRegex },
            { 'client.lastName': searchRegex },
            { 'trainer.firstName': searchRegex },
            { 'trainer.lastName': searchRegex },
          ],
        },
      });
    }

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await Appointment.aggregate(countPipeline);
    const totalAppointments = countResult[0]?.total || 0;

    // Add sorting and pagination
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    pipeline.push({ $sort: sort }, { $skip: skip }, { $limit: parseInt(limit) });

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
          email: '$client.email',
        },
        trainerId: {
          _id: '$trainer._id',
          firstName: '$trainer.firstName',
          lastName: '$trainer.lastName',
          email: '$trainer.email',
        },
      },
    });

    // Execute aggregation
    const appointments = await Appointment.aggregate(pipeline);

    // Calculate pagination info
    const totalPages = Math.ceil(totalAppointments / limit);
    const pagination = {
      currentPage: parseInt(page),
      totalPages,
      totalAppointments,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    // Log admin action
    logAdminAction('view_all_appointments', req.user.id, { query: req.query });

    res.json({
      appointments,
      pagination,
    });
  } catch (err) {
    logger.error('Appointment operation failed', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/appointments/user - Get user's appointments
/**
 * @route   GET /api/appointments/user
 * @desc    Get appointments for the authenticated user (as client or trainer)
 * @access  Private
 * @returns {Object} Object with success and appointments array
 * @throws  {500} Server error
 */
router.get('/user', async (req, res) => {
  try {
    logger.info('Fetching appointments for user', { userId: req.user.id });

    // Validate subscription dates safely
    const validateDate = date => {
      if (!date) return null;
      const d = new Date(date);
      return isNaN(d.getTime()) ? null : d;
    };

    const appointments = await Appointment.find({
      $or: [{ clientId: req.user.id }, { trainerId: req.user.id }],
    })
      .populate('clientId', 'firstName lastName email')
      .populate('trainerId', 'firstName lastName email')
      .sort({ date: 1, time: 1 });

    // Process appointments to handle any invalid dates
    const processedAppointments = appointments.map(apt => {
      // Ensure date is valid
      if (apt.date) {
        const validDate = validateDate(apt.date);
        apt.date = validDate || new Date(); // Default to now if invalid
      }
      return apt;
    });

    logger.info('Appointments fetched', { count: processedAppointments.length, userId: req.user.id });

    res.json({
      success: true,
      appointments: processedAppointments,
    });
  } catch (err) {
    logger.error('Error fetching user appointments', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});

// GET /api/appointments/:id - Get specific appointment
/**
 * @route   GET /api/appointments/:id
 * @desc    Get a specific appointment by ID
 * @access  Private (Admin, or appointment client/trainer)
 * @param   {string} id - Appointment ID
 * @returns {Object} Appointment object with populated client/trainer info
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Appointment not found
 * @throws  {500} Server error
 */
router.get('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('clientId', 'firstName lastName email')
      .populate('trainerId', 'firstName lastName email');

    if (!appointment) {
      return res.status(404).json({ msg: 'Appointment not found' });
    }

    // Allow access if user is the client or trainer of the appointment
    if (
      appointment.clientId._id.toString() !== req.user.id &&
      appointment.trainerId._id.toString() !== req.user.id
    ) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    res.json(appointment);
  } catch (err) {
    logger.error('Appointment operation failed', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/appointments - Create new appointment
/**
 * @route   POST /api/appointments
 * @desc    Create a new appointment booking
 * @access  Private
 * @body    {string} trainerId - ID of the trainer (must be admin role)
 * @body    {string} date - Appointment date (YYYY-MM-DD format)
 * @body    {string} time - Appointment time (HH:MM format)
 * @body    {string} [notes] - Optional appointment notes
 * @returns {Object} Created appointment object with populated client/trainer info
 * @throws  {400} Missing required fields or invalid trainer or time slot full (max 6 clients per slot)
 * @throws  {500} Server error
 */
router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const { trainerId, date, time, notes } = req.body;

    // Validate required fields
    if (!trainerId || !date || !time) {
      logger.warn('Validation failed: missing required fields', { trainerId, date, time });
      return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    // Check if trainer exists and is trainer
    const trainer = await User.findById(trainerId);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(400).json({ msg: 'Invalid trainer' });
    }

    // Validate against trainer's availability
    const appointmentDate = new Date(date);
    const dayOfWeek = appointmentDate.getUTCDay();
    const [hours, minutes] = time.split(':').map(Number);

    const availability = await TrainerAvailability.findOne({
      trainerId,
      dayOfWeek,
      isActive: true,
    });

    if (!availability) {
      return res.status(400).json({ msg: 'Trainer is not available on this day' });
    }

    if (hours < availability.startHour || hours >= availability.endHour) {
      return res.status(400).json({
        msg: `Trainer is only available from ${availability.startHour}:00 to ${availability.endHour}:00 on this day`,
      });
    }

    // Set clientId from authenticated user
    const clientId = req.user.id;

    // Check if this client already has an appointment on this date (across all trainers)
    const clientExistingOnDate = await Appointment.findOne({
      clientId,
      date: appointmentDate,
      status: { $ne: 'cancelled' },
    });

    if (clientExistingOnDate) {
      return res.status(400).json({ msg: 'You can only book one appointment per day' });
    }

    // Appointments must be booked at least one day in advance (no same-day bookings)
    const todayUTCStr = new Date().toISOString().split('T')[0];
    if (date <= todayUTCStr) {
      return res.status(400).json({ msg: 'Appointments must be booked at least one day in advance' });
    }

    if (minutes !== 0) {
      return res
        .status(400)
        .json({ msg: 'Appointments can only be booked on the hour (e.g., 5:00, 6:00)' });
    }

    // Enforce the trainer's configured slot capacity
    const slotCapacity = availability.slotCapacity ?? 6;

    const existingCount = await Appointment.countDocuments({
      trainerId,
      date: appointmentDate,
      time,
      status: { $ne: 'cancelled' },
    });

    if (existingCount >= slotCapacity) {
      return res.status(409).json({ msg: `Time slot is fully booked (max ${slotCapacity})` });
    }

    // Check if this client already has an appointment at this exact date and time (across all trainers)
    const clientExisting = await Appointment.findOne({
      clientId,
      date: appointmentDate,
      time: time,
      status: { $ne: 'cancelled' },
    });

    if (clientExisting) {
      return res
        .status(400)
        .json({ msg: 'You already have an appointment in this time slot' });
    }

    // Create appointment
    const appointment = new Appointment({
      clientId,
      trainerId,
      date,
      time,
      notes,
    });

    await appointment.save();
    await appointment.populate('clientId', 'firstName lastName email');
    await appointment.populate('trainerId', 'firstName lastName email');

    // Log the successful booking
    logUserAction('book_appointment', req.user.id, {
      appointmentId: appointment._id,
      trainerId,
      date,
      time,
    });

    res.status(201).json(appointment);
  } catch (err) {
    logger.error('Appointment operation failed', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/appointments/:id - Update appointment
/**
 * @route   PUT /api/appointments/:id
 * @desc    Update an existing appointment
 * @access  Private (Admin or appointment trainer)
 * @param   {string} id - Appointment ID
 * @body    {string} [date] - Updated appointment date
 * @body    {string} [time] - Updated appointment time
 * @body    {string} [status] - Updated appointment status ('scheduled', 'completed', 'cancelled')
 * @body    {string} [notes] - Updated appointment notes
 * @returns {Object} Updated appointment object with populated client/trainer info
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Appointment not found
 * @throws  {500} Server error
 */
router.put(
  '/:id',
  allowOnlyFields(['trainerId', 'date', 'time', 'status', 'notes'], true),
  async (req, res) => {
    try {
      const appointment = await Appointment.findById(req.params.id);

      if (!appointment) {
        return res.status(404).json({ msg: 'Appointment not found' });
      }

      // Allow update if user is admin, or the trainer or the client who owns the appointment
      if (
        req.user.role !== 'admin' &&
        appointment.trainerId.toString() !== req.user.id &&
        appointment.clientId.toString() !== req.user.id
      ) {
        return res.status(403).json({ msg: 'Access denied' });
      }

      const { trainerId, date, time, status, notes } = req.body;

      // Update fields
      if (trainerId) {
        // Validate trainer exists and has the trainer role
        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
          return res.status(400).json({ msg: 'Invalid trainer' });
        }
        appointment.trainerId = trainerId;
      }
      if (date) appointment.date = date;
      if (time) appointment.time = time;
      if (status) {
        // Allow admins to update any status
        if (req.user.role === 'admin') {
          appointment.status = status;
        } else if (
          req.user.role === 'trainer' &&
          appointment.trainerId.toString() === req.user.id
        ) {
          // Allow trainers to update status to completed, no_show, late
          if (['completed', 'no_show', 'late'].includes(status)) {
            appointment.status = status;
          } else {
            return res.status(400).json({
              msg: 'Trainers can only update status to completed, no_show, or late',
            });
          }
        } else if (req.user.id === appointment.clientId.toString()) {
          // Clients can only cancel
          if (status === 'cancelled') {
            appointment.status = status;
          } else {
            return res.status(400).json({ msg: 'Clients can only cancel appointments' });
          }
        } else {
          return res.status(403).json({ msg: 'Access denied' });
        }
      }
      if (notes !== undefined) appointment.notes = notes;

      await appointment.save();
      await appointment.populate('clientId', 'firstName lastName email');
      await appointment.populate('trainerId', 'firstName lastName email');

      // Log the action
      if (appointment.clientId.toString() === req.user.id && status === 'cancelled') {
        logUserAction('cancel_appointment', req.user.id, {
          appointmentId: req.params.id,
        });
      } else {
        logAdminAction('update_appointment', req.user.id, {
          appointmentId: req.params.id,
          updates: req.body,
        });
      }

      res.json(appointment);
    } catch (err) {
      logger.error('Appointment operation failed', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// DELETE /api/appointments/:id - Delete appointment
/**
 * @route   DELETE /api/appointments/:id
 * @desc    Delete an appointment
 * @access  Private (Admin, appointment trainer, or appointment client)
 * @param   {string} id - Appointment ID
 * @returns {Object} Success message
 * @throws  {403} Access denied if not authorized
 * @throws  {404} Appointment not found
 * @throws  {500} Server error
 */
router.delete('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ msg: 'Appointment not found' });
    }

    // Allow delete if user is the trainer or the client who owns the appointment
    if (
      appointment.trainerId.toString() !== req.user.id &&
      appointment.clientId.toString() !== req.user.id
    ) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // Log the action
    if (req.user.role === 'admin') {
      logAdminAction('delete_appointment', req.user.id, { appointmentId: req.params.id });
    } else if (appointment.trainerId.toString() === req.user.id) {
      logAdminAction('delete_appointment', req.user.id, { appointmentId: req.params.id });
    } else {
      logUserAction('delete_appointment', req.user.id, { appointmentId: req.params.id });
    }

    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Appointment deleted successfully' });
  } catch (err) {
    logger.error('Appointment operation failed', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
