/**
 * @swagger
 * tags:
 *   name: Trainer
 *   description: Trainer dashboard, client management, appointments, and availability
 */

const express = require('express');

const router = express.Router();
const trainerController = require('../controllers/trainerController');
const { requireTrainer } = require('../middleware/auth');
const TrainerAvailability = require('../models/TrainerAvailability');
const User = require('../models/User');
const { logger } = require('../services/logger');

/**
 * @swagger
 * /trainer/dashboard:
 *   get:
 *     summary: Get trainer dashboard summary
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *       403:
 *         description: Trainer access required
 */
router.get('/dashboard', requireTrainer, trainerController.getDashboard);

/**
 * @swagger
 * /trainer/clients:
 *   get:
 *     summary: Get the trainer's client list
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clients
 *       403:
 *         description: Trainer access required
 */
router.get('/clients', requireTrainer, trainerController.getClients);

/**
 * @swagger
 * /trainer/appointments:
 *   get:
 *     summary: Get all appointments for the trainer
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of trainer appointments
 *       403:
 *         description: Trainer access required
 */
router.get('/appointments', requireTrainer, trainerController.getAppointments);

/**
 * @swagger
 * /trainer/appointments/{id}:
 *   get:
 *     summary: Get a specific appointment by ID (trainer only)
 *     tags: [Trainer]
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
 *       403:
 *         description: Trainer access required
 *       404:
 *         description: Appointment not found
 */
router.get('/appointments/:id', requireTrainer, trainerController.getAppointmentById);

/**
 * @swagger
 * /trainer/appointments/{id}:
 *   put:
 *     summary: Update an appointment status or notes (trainer only)
 *     tags: [Trainer]
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
 *               status:
 *                 type: string
 *                 enum: [completed, no_show, late]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment updated
 *       403:
 *         description: Trainer access required
 *       404:
 *         description: Appointment not found
 */
router.put('/appointments/:id', requireTrainer, trainerController.updateAppointment);

/**
 * @swagger
 * /trainer/client/{clientId}:
 *   get:
 *     summary: Get detailed info for a specific client (trainer only)
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client information
 *       403:
 *         description: Trainer access required
 *       404:
 *         description: Client not found
 */
router.get('/client/:clientId', requireTrainer, trainerController.getClientInfo);

/**
 * @swagger
 * /trainer/{id}/availability:
 *   get:
 *     summary: Get a trainer's weekly availability slots
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trainer user ID
 *     responses:
 *       200:
 *         description: Availability slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 availability:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       dayOfWeek:
 *                         type: integer
 *                       startHour:
 *                         type: integer
 *                       endHour:
 *                         type: integer
 *                       isActive:
 *                         type: boolean
 *                       slotCapacity:
 *                         type: integer
 *       500:
 *         description: Server error
 */
router.get('/:id/availability', async (req, res) => {
  try {
    const slots = await TrainerAvailability.find({
      trainerId: req.params.id,
      isActive: true,
    }).sort({ dayOfWeek: 1 });

    res.json({ success: true, availability: slots });
  } catch (err) {
    logger.error('Trainer availability fetch failed', { error: err.message, trainerId: req.params.id });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /trainer/availability:
 *   put:
 *     summary: Set the authenticated trainer's weekly availability
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - availability
 *             properties:
 *               availability:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - dayOfWeek
 *                     - startHour
 *                     - endHour
 *                   properties:
 *                     dayOfWeek:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 6
 *                     startHour:
 *                       type: integer
 *                     endHour:
 *                       type: integer
 *                     isActive:
 *                       type: boolean
 *                       default: true
 *                     slotCapacity:
 *                       type: integer
 *                       default: 6
 *     responses:
 *       200:
 *         description: Availability updated
 *       400:
 *         description: Validation error
 *       403:
 *         description: Trainer access required
 *       500:
 *         description: Server error
 */
router.put('/availability', requireTrainer, async (req, res) => {
  try {
    const { availability } = req.body;

    if (!Array.isArray(availability) || availability.length === 0) {
      return res.status(400).json({ success: false, error: 'availability array is required' });
    }

    const trainerId = req.user.id;
    const results = [];

    for (const slot of availability) {
      const { dayOfWeek, startHour, endHour, isActive = true, slotCapacity = 6 } = slot;

      if (dayOfWeek === undefined || startHour === undefined || endHour === undefined) {
        return res.status(400).json({ success: false, error: 'Each slot requires dayOfWeek, startHour, endHour' });
      }

      if (endHour <= startHour) {
        return res.status(400).json({ success: false, error: 'endHour must be greater than startHour' });
      }

      const capacity = Math.min(50, Math.max(1, parseInt(slotCapacity) || 6));

      const updated = await TrainerAvailability.findOneAndUpdate(
        { trainerId, dayOfWeek },
        { trainerId, dayOfWeek, startHour, endHour, isActive, slotCapacity: capacity },
        { upsert: true, new: true }
      );
      results.push(updated);
    }

    logger.info('Trainer availability updated', { trainerId, slots: results.length });
    res.json({ success: true, availability: results });
  } catch (err) {
    logger.error('Trainer availability update failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /trainer/notification-preference:
 *   put:
 *     summary: Set the trainer's email notification preference for appointments
 *     tags: [Trainer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preference
 *             properties:
 *               preference:
 *                 type: string
 *                 enum: [individual, daily_digest]
 *     responses:
 *       200:
 *         description: Preference updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preference:
 *                   type: string
 *       400:
 *         description: Invalid preference value
 *       403:
 *         description: Trainer access required
 *       500:
 *         description: Server error
 */
router.put('/notification-preference', requireTrainer, async (req, res) => {
  try {
    const { preference } = req.body;
    if (!['individual', 'daily_digest'].includes(preference)) {
      return res.status(400).json({ success: false, error: 'preference must be "individual" or "daily_digest"' });
    }
    await User.findByIdAndUpdate(req.user.id, { trainerEmailPreference: preference });
    logger.info('Trainer notification preference updated', { trainerId: req.user.id, preference });
    res.json({ success: true, preference });
  } catch (err) {
    logger.error('Trainer notification preference update failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
