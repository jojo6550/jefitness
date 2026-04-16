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

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

/** Normalize a date to YYYY-MM-DD string, handle string/Date/timestamp */
function normalizeAppointmentDate(date) {
  const normalized =
    typeof date === 'string'
      ? date.slice(0, 10)
      : new Date(date).toISOString().slice(0, 10);
  return new Date(normalized + 'T00:00:00.000Z');
}

/** Format date for email display */
function formatApptDateForEmail(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Extract and format appointment participant names */
function extractApptNames(appointment) {
  const clientName = appointment.clientId
    ? `${appointment.clientId.firstName} ${appointment.clientId.lastName}`
    : 'Unknown Client';
  const trainerName = appointment.trainerId
    ? `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}`
    : 'Unknown Trainer';
  return { clientName, trainerName };
}

/** Populate both clientId and trainerId on appointment */
async function populateAppointmentParticipants(appointment, fields = {}) {
  const clientFields = fields.client || 'firstName lastName email';
  const trainerFields = fields.trainer || 'firstName lastName email';
  await appointment.populate('clientId', clientFields);
  await appointment.populate('trainerId', trainerFields);
}

/** Send appointment notification emails */
async function sendApptEmails(appointment, action, clientName, trainerName, dateStr) {
  const apptId = appointment._id.toString();
  const apptDate = appointment.date instanceof Date
    ? appointment.date.toISOString()
    : appointment.date;
  const { time, clientId, trainerId } = appointment;

  if (action === 'created') {
    // Confirm to client
    if (clientId?.email) {
      sendAppointmentConfirmationClient(
        clientId.email, clientId.firstName, trainerName, dateStr, time, apptId, apptDate
      ).catch(e => logger.warn('Failed to send booking confirmation', { error: e.message }));
    }
  } else if (action === 'cancelled') {
    // Notify client
    if (clientId?.email) {
      sendAppointmentCancelledClient(
        clientId.email, clientId.firstName, trainerName, dateStr, time, 'cancelled', apptId, apptDate
      ).catch(e => logger.warn('Failed to send cancellation to client', { error: e.message }));
    }
    // Notify trainer if individual preference
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentCancelledTrainer(
        trainerId.email, trainerId.firstName, clientName, dateStr, time, 'cancelled', apptId, apptDate
      ).catch(e => logger.warn('Failed to send cancellation to trainer', { error: e.message }));
    }
  } else if (action === 'deleted') {
    // Notify both on deletion
    if (clientId?.email) {
      sendAppointmentCancelledClient(
        clientId.email, clientId.firstName, trainerName, dateStr, time, 'deleted', apptId, apptDate
      ).catch(e => logger.warn('Failed to send deletion to client', { error: e.message }));
    }
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentCancelledTrainer(
        trainerId.email, trainerId.firstName, clientName, dateStr, time, 'deleted', apptId, apptDate
      ).catch(e => logger.warn('Failed to send deletion to trainer', { error: e.message }));
    }
  } else if (action === 'updated') {
    // Notify of changes
    if (clientId?.email) {
      sendAppointmentUpdatedClient(
        clientId.email, clientId.firstName, trainerName, dateStr, time, apptId, apptDate
      ).catch(e => logger.warn('Failed to send update to client', { error: e.message }));
    }
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentUpdatedTrainer(
        trainerId.email, trainerId.firstName, clientName, dateStr, time, apptId, apptDate
      ).catch(e => logger.warn('Failed to send update to trainer', { error: e.message }));
    }
  } else if (action === 'created_trainer_individual') {
    // Only send individual trainer notification on creation
    if (trainerId?.email && trainerId?.trainerEmailPreference === 'individual') {
      sendNewAppointmentNotification(
        trainerId.email, trainerId.firstName, clientName, dateStr, time, apptId, apptDate
      ).catch(e => logger.warn('Failed to send individual appointment notification', { error: e.message }));
    }
  }
}

/** Validate status transition based on role */
function validateStatusTransition(role, currentStatus, newStatus, trainerMatch, clientMatch) {
  if (role === 'admin') return true;
  if (role === 'trainer' && trainerMatch && ['completed', 'no_show', 'late'].includes(newStatus)) return true;
  if (clientMatch && newStatus === 'cancelled') return true;
  return false;
}
const Appointment = require('../models/Appointment');
const TrainerAvailability = require('../models/TrainerAvailability');
const User = require('../models/User');
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { requireAdmin } = require('../middleware/auth');
const { logger, logError, logAdminAction, logUserAction } = require('../services/logger');
const { allowOnlyFields } = require('../middleware/inputValidator');
const {
  sendAppointmentConfirmationClient,
  sendNewAppointmentNotification,
  sendAppointmentCancelledTrainer,
  sendAppointmentCancelledClient,
  sendAppointmentUpdatedTrainer,
  sendAppointmentUpdatedClient,
} = require('../services/email');

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
router.get('/', requireAdmin, async (req, res) => {
  try {
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
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
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
    logAdminAction('view_all_appointments', req.user.id, {
      query: req.query,
      resultCount: appointments.length,
    }, req);

    res.json({
      appointments,
      pagination,
    });
  } catch (err) {
    logger.error('Failed to fetch appointments list', { error: err.message });
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

    logger.info('Appointments fetched', {
      count: processedAppointments.length,
      userId: req.user.id,
    });

    res.json({
      success: true,
      appointments: processedAppointments,
    });
  } catch (err) {
    logger.error('Error fetching user appointments', {
      error: err.message,
      stack: err.stack,
    });
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

    const isOwner = [appointment.clientId?._id, appointment.trainerId?._id]
      .some(id => id?.toString() === req.user.id);
    if (!isOwner) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    res.json(appointment);
  } catch (err) {
    logger.error('Failed to fetch appointment by ID', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const { trainerId, date, time, notes } = req.body;

    if (!trainerId || !date || !time) {
      logger.warn('Validation failed: missing required fields', { trainerId, date, time });
      return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    const appointmentDate = normalizeAppointmentDate(date);

    // Check if trainer exists and is trainer
    const trainer = await User.findById(trainerId);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(400).json({ msg: 'Invalid trainer' });
    }

    // Validate against trainer's availability
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

    const clientId = req.user.id;
    const dateStr = appointmentDate.toISOString().slice(0, 10);
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    const clientExistingOnDate = await Appointment.findOne({
      clientId,
      date: { $gte: startOfDay, $lt: endOfDay },
      status: { $ne: 'cancelled' },
    });

    if (clientExistingOnDate) {
      logger.info('Client already has appointment on this day', {
        clientId, requestedDate: dateStr, existingAppointmentId: clientExistingOnDate._id,
      });
      return res.status(400).json({ msg: 'You can only book one appointment per day' });
    }

    const todayUTCStr = new Date().toISOString().slice(0, 10);
    if (dateStr <= todayUTCStr) {
      return res
        .status(400)
        .json({ msg: 'Appointments must be booked at least one day in advance' });
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
      return res
        .status(409)
        .json({ msg: `Time slot is fully booked (max ${slotCapacity})` });
    }

    // Create appointment
    const appointment = new Appointment({
      clientId,
      trainerId,
      date: appointmentDate,
      time,
      notes,
    });

    try {
      await appointment.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(409).json({ msg: 'Time slot is fully booked (concurrent booking conflict)' });
      }
      throw saveErr;
    }

    await populateAppointmentParticipants(appointment);
    const { clientName, trainerName } = extractApptNames(appointment);
    const emailDateStr = formatApptDateForEmail(appointment.date);

    logUserAction('book_appointment', req.user.id, {
      appointmentId: appointment._id,
      clientName, clientEmail: appointment.clientId.email,
      trainerName, trainerEmail: appointment.trainerId.email,
      date, time,
    });

    await sendApptEmails(appointment, 'created', clientName, trainerName, emailDateStr);
    await sendApptEmails(appointment, 'created_trainer_individual', clientName, trainerName, emailDateStr);

    res.status(201).json(appointment);
  } catch (err) {
    logger.error('Failed to create appointment', { error: err.message });
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

      // Allow update if user is admin only. Trainers use /api/v1/trainer/appointments/:id instead.
      if (req.user.role !== 'admin') {
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
        const trainerMatch = appointment.trainerId?.toString() === req.user.id;
        const clientMatch = appointment.clientId?.toString() === req.user.id;

        if (!validateStatusTransition(req.user.role, appointment.status, status, trainerMatch, clientMatch)) {
          const msg = req.user.role === 'trainer'
            ? 'Trainers can only update status to completed, no_show, or late'
            : req.user.role === 'client' ? 'Clients can only cancel appointments'
            : 'Access denied';
          return res.status(400).json({ msg });
        }
        appointment.status = status;
      }
      if (notes !== undefined) appointment.notes = notes;

      await appointment.save();
      await populateAppointmentParticipants(appointment, {
        trainer: 'firstName lastName email trainerEmailPreference'
      });

      const { clientName, trainerName } = extractApptNames(appointment);
      const isClientCancelling = appointment.clientId?._id?.toString() === req.user.id && status === 'cancelled';

      if (isClientCancelling) {
        logUserAction('cancel_appointment', req.user.id, {
          appointmentId: req.params.id, clientName, clientEmail: appointment.clientId?.email,
          trainerName, trainerEmail: appointment.trainerId?.email,
        });
      } else {
        logAdminAction('update_appointment', req.user.id, {
          appointmentId: req.params.id, clientName, clientEmail: appointment.clientId?.email,
          trainerName, trainerEmail: appointment.trainerId?.email, updates: req.body,
        }, req);
      }

      const emailDateStr = formatApptDateForEmail(appointment.date);
      if (status === 'cancelled') {
        await sendApptEmails(appointment, 'cancelled', clientName, trainerName, emailDateStr);
      } else if (date || time) {
        await sendApptEmails(appointment, 'updated', clientName, trainerName, emailDateStr);
      }

      res.json(appointment);
    } catch (err) {
      logger.error('Failed to update appointment', { error: err.message });
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

    const isOwner = req.user.role === 'admin' ||
      appointment.trainerId?.toString() === req.user.id ||
      appointment.clientId?.toString() === req.user.id;

    if (!isOwner) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    await populateAppointmentParticipants(appointment, {
      trainer: 'firstName lastName email trainerEmailPreference'
    });

    const { clientName, trainerName } = extractApptNames(appointment);
    const isAdminOrTrainer = req.user.role === 'admin' || appointment.trainerId?._id?.toString() === req.user.id;

    if (isAdminOrTrainer) {
      logAdminAction('delete_appointment', req.user.id, {
        appointmentId: req.params.id, clientName, clientEmail: appointment.clientId?.email,
        trainerName, trainerEmail: appointment.trainerId?.email,
      }, req);
    } else {
      logUserAction('delete_appointment', req.user.id, {
        appointmentId: req.params.id, clientName, clientEmail: appointment.clientId?.email,
        trainerName, trainerEmail: appointment.trainerId?.email,
      });
    }

    await Appointment.findByIdAndDelete(req.params.id);

    const emailDateStr = formatApptDateForEmail(appointment.date);
    await sendApptEmails(appointment, 'deleted', clientName, trainerName, emailDateStr);

    res.json({ msg: 'Appointment deleted successfully' });
  } catch (err) {
    logger.error('Failed to delete appointment', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
