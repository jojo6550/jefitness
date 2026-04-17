const Appointment = require('../models/Appointment');
const TrainerAvailability = require('../models/TrainerAvailability');
const User = require('../models/User');
const { logger, logAdminAction, logUserAction } = require('../services/logger');
const {
  normalizeAppointmentDate,
  formatApptDateForEmail,
  extractApptNames,
  populateAppointmentParticipants,
  sendApptEmails,
  validateStatusTransition,
} = require('../services/appointmentEmails');

const appointmentController = {
  /**
   * GET /appointments — admin only, paginated + searchable list.
   */
  listAppointments: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        sortBy = 'date',
        sortOrder = 'asc',
        status = '',
      } = req.query;

      const pipeline = [];

      if (status) {
        pipeline.push({ $match: { status } });
      }

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

      const countPipeline = [...pipeline, { $count: 'total' }];
      const countResult = await Appointment.aggregate(countPipeline);
      const totalAppointments = countResult[0]?.total || 0;

      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      const skip = (page - 1) * limit;

      pipeline.push({ $sort: sort }, { $skip: skip }, { $limit: parseInt(limit) });

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

      const appointments = await Appointment.aggregate(pipeline);

      const totalPages = Math.ceil(totalAppointments / limit);
      const pagination = {
        currentPage: parseInt(page),
        totalPages,
        totalAppointments,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      logAdminAction(
        'view_all_appointments',
        req.user.id,
        { query: req.query, resultCount: appointments.length },
        req
      );

      res.json({ appointments, pagination });
    } catch (err) {
      logger.error('Failed to fetch appointments list', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  },

  /**
   * GET /appointments/user — all appointments for the authenticated user.
   */
  getUserAppointments: async (req, res) => {
    try {
      logger.info('Fetching appointments for user', { userId: req.user.id });

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

      const processedAppointments = appointments.map(apt => {
        if (apt.date) {
          const validDate = validateDate(apt.date);
          apt.date = validDate || new Date();
        }
        return apt;
      });

      logger.info('Appointments fetched', {
        count: processedAppointments.length,
        userId: req.user.id,
      });

      res.json({ success: true, appointments: processedAppointments });
    } catch (err) {
      logger.error('Error fetching user appointments', {
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({ error: 'Server error fetching appointments' });
    }
  },

  /**
   * GET /appointments/:id — participant or admin only.
   */
  getAppointmentById: async (req, res) => {
    try {
      const appointment = await Appointment.findById(req.params.id)
        .populate('clientId', 'firstName lastName email')
        .populate('trainerId', 'firstName lastName email');

      if (!appointment) {
        return res.status(404).json({ msg: 'Appointment not found' });
      }

      const isOwner = [appointment.clientId?._id, appointment.trainerId?._id].some(
        id => id?.toString() === req.user.id
      );
      if (!isOwner) {
        return res.status(403).json({ msg: 'Access denied' });
      }

      res.json(appointment);
    } catch (err) {
      logger.error('Failed to fetch appointment by ID', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  },

  /**
   * POST /appointments — requires active subscription.
   */
  createAppointment: async (req, res) => {
    try {
      const { trainerId, date, time, notes } = req.body;

      if (!trainerId || !date || !time) {
        logger.warn('Validation failed: missing required fields', {
          trainerId,
          date,
          time,
        });
        return res.status(400).json({ msg: 'Please provide all required fields' });
      }

      const appointmentDate = normalizeAppointmentDate(date);

      const trainer = await User.findById(trainerId);
      if (!trainer || trainer.role !== 'trainer') {
        return res.status(400).json({ msg: 'Invalid trainer' });
      }

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
          clientId,
          requestedDate: dateStr,
          existingAppointmentId: clientExistingOnDate._id,
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
        return res.status(400).json({
          msg: 'Appointments can only be booked on the hour (e.g., 5:00, 6:00)',
        });
      }

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
          return res
            .status(409)
            .json({ msg: 'Time slot is fully booked (concurrent booking conflict)' });
        }
        throw saveErr;
      }

      await populateAppointmentParticipants(appointment);
      const { clientName, trainerName } = extractApptNames(appointment);
      const emailDateStr = formatApptDateForEmail(appointment.date);

      logUserAction('book_appointment', req.user.id, {
        appointmentId: appointment._id,
        clientName,
        clientEmail: appointment.clientId.email,
        trainerName,
        trainerEmail: appointment.trainerId.email,
        date,
        time,
      });

      await sendApptEmails(appointment, 'created', clientName, trainerName, emailDateStr);
      await sendApptEmails(
        appointment,
        'created_trainer_individual',
        clientName,
        trainerName,
        emailDateStr
      );

      res.status(201).json(appointment);
    } catch (err) {
      logger.error('Failed to create appointment', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  },

  /**
   * PUT /appointments/:id — admin only via this route (trainers use trainer route).
   */
  updateAppointment: async (req, res) => {
    try {
      const appointment = await Appointment.findById(req.params.id);

      if (!appointment) {
        return res.status(404).json({ msg: 'Appointment not found' });
      }

      if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
      }

      const { trainerId, date, time, status, notes } = req.body;

      if (trainerId) {
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

        if (
          !validateStatusTransition(
            req.user.role,
            appointment.status,
            status,
            trainerMatch,
            clientMatch
          )
        ) {
          const msg =
            req.user.role === 'trainer'
              ? 'Trainers can only update status to completed, no_show, or late'
              : req.user.role === 'client'
                ? 'Clients can only cancel appointments'
                : 'Access denied';
          return res.status(400).json({ msg });
        }
        appointment.status = status;
      }
      if (notes !== undefined) appointment.notes = notes;

      await appointment.save();
      await populateAppointmentParticipants(appointment, {
        trainer: 'firstName lastName email trainerEmailPreference',
      });

      const { clientName, trainerName } = extractApptNames(appointment);
      const isClientCancelling =
        appointment.clientId?._id?.toString() === req.user.id && status === 'cancelled';

      if (isClientCancelling) {
        logUserAction('cancel_appointment', req.user.id, {
          appointmentId: req.params.id,
          clientName,
          clientEmail: appointment.clientId?.email,
          trainerName,
          trainerEmail: appointment.trainerId?.email,
        });
      } else {
        logAdminAction(
          'update_appointment',
          req.user.id,
          {
            appointmentId: req.params.id,
            clientName,
            clientEmail: appointment.clientId?.email,
            trainerName,
            trainerEmail: appointment.trainerId?.email,
            updates: req.body,
          },
          req
        );
      }

      const emailDateStr = formatApptDateForEmail(appointment.date);
      if (status === 'cancelled') {
        await sendApptEmails(
          appointment,
          'cancelled',
          clientName,
          trainerName,
          emailDateStr
        );
      } else if (date || time) {
        await sendApptEmails(
          appointment,
          'updated',
          clientName,
          trainerName,
          emailDateStr
        );
      }

      res.json(appointment);
    } catch (err) {
      logger.error('Failed to update appointment', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  },

  /**
   * DELETE /appointments/:id — trainer/client/admin.
   */
  deleteAppointment: async (req, res) => {
    try {
      const appointment = await Appointment.findById(req.params.id);

      if (!appointment) {
        return res.status(404).json({ msg: 'Appointment not found' });
      }

      const isOwner =
        req.user.role === 'admin' ||
        appointment.trainerId?.toString() === req.user.id ||
        appointment.clientId?.toString() === req.user.id;

      if (!isOwner) {
        return res.status(403).json({ msg: 'Access denied' });
      }

      await populateAppointmentParticipants(appointment, {
        trainer: 'firstName lastName email trainerEmailPreference',
      });

      const { clientName, trainerName } = extractApptNames(appointment);
      const isAdminOrTrainer =
        req.user.role === 'admin' ||
        appointment.trainerId?._id?.toString() === req.user.id;

      if (isAdminOrTrainer) {
        logAdminAction(
          'delete_appointment',
          req.user.id,
          {
            appointmentId: req.params.id,
            clientName,
            clientEmail: appointment.clientId?.email,
            trainerName,
            trainerEmail: appointment.trainerId?.email,
          },
          req
        );
      } else {
        logUserAction('delete_appointment', req.user.id, {
          appointmentId: req.params.id,
          clientName,
          clientEmail: appointment.clientId?.email,
          trainerName,
          trainerEmail: appointment.trainerId?.email,
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
  },
};

module.exports = appointmentController;
