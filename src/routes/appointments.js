/**
 * @swagger
 * tags:
 *   name: Appointments
 *   description: Appointment booking, management, and cancellation
 *
 * @swagger
 * components:
 *   schemas:
 *     Appointment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         clientId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             email:
 *               type: string
 *         trainerId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             email:
 *               type: string
 *         date:
 *           type: string
 *           format: date
 *         time:
 *           type: string
 *           example: "09:00"
 *         status:
 *           type: string
 *           enum: [scheduled, completed, cancelled, no_show, late]
 *         notes:
 *           type: string
 */

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
const { sendNewAppointmentNotification } = require('../services/email');

/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: Get all appointments with pagination and filtering (admin only)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by client or trainer name
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: date
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, completed, cancelled, no_show, late]
 *     responses:
 *       200:
 *         description: Paginated appointment list
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 *   post:
 *     summary: Create a new appointment booking (requires active subscription)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trainerId
 *               - date
 *               - time
 *             properties:
 *               trainerId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Must be at least one day in the future (YYYY-MM-DD)
 *               time:
 *                 type: string
 *                 example: "09:00"
 *                 description: On-the-hour only (e.g. 09:00, 14:00)
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Appointment'
 *       400:
 *         description: Validation error or slot unavailable
 *       409:
 *         description: Time slot fully booked
 *       500:
 *         description: Server error
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

/**
 * @swagger
 * /appointments/user:
 *   get:
 *     summary: Get all appointments for the authenticated user (as client or trainer)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Appointment'
 *       500:
 *         description: Server error
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

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get a specific appointment by ID (participant or admin only)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Appointment'
 *       403:
 *         description: Access denied
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 *   put:
 *     summary: Update an appointment (admin, trainer, or client with restrictions)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trainerId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [scheduled, completed, cancelled, no_show, late]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated appointment
 *       400:
 *         description: Status transition not allowed for this role
 *       403:
 *         description: Access denied
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete an appointment (trainer, client, or admin)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Appointment deleted
 *       403:
 *         description: Access denied
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
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

    // Send individual email notification if trainer prefers it
    if (trainer.trainerEmailPreference === 'individual' && trainer.email) {
      try {
        const clientName = `${appointment.clientId.firstName} ${appointment.clientId.lastName}`;
        const aptDate = new Date(date);
        const dateStr = aptDate.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
        });
        await sendNewAppointmentNotification(trainer.email, trainer.firstName, clientName, dateStr, time);
      } catch (emailErr) {
        logger.warn('Failed to send individual appointment notification', { trainerId, error: emailErr.message });
      }
    }

    res.status(201).json(appointment);
  } catch (err) {
    logger.error('Appointment operation failed', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

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
