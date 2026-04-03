const express = require('express');

const router = express.Router();
const trainerController = require('../controllers/trainerController');
const { requireTrainer } = require('../middleware/auth');
const TrainerAvailability = require('../models/TrainerAvailability');
const { logger } = require('../services/logger');

/**
 * @route   GET /api/trainer/dashboard
 * @access  Private (Trainer only)
 */
router.get('/dashboard', requireTrainer, trainerController.getDashboard);

/**
 * @route   GET /api/trainer/clients
 * @access  Private (Trainer only)
 */
router.get('/clients', requireTrainer, trainerController.getClients);

/**
 * @route   GET /api/trainer/appointments
 * @access  Private (Trainer only)
 */
router.get('/appointments', requireTrainer, trainerController.getAppointments);

/**
 * @route   GET /api/trainer/appointments/:id
 * @access  Private (Trainer only)
 */
router.get('/appointments/:id', requireTrainer, trainerController.getAppointmentById);

/**
 * @route   PUT /api/trainer/appointments/:id
 * @access  Private (Trainer only)
 */
router.put('/appointments/:id', requireTrainer, trainerController.updateAppointment);

/**
 * @route   GET /api/trainer/client/:clientId
 * @access  Private (Trainer only)
 */
router.get('/client/:clientId', requireTrainer, trainerController.getClientInfo);

/**
 * @route   GET /api/v1/trainer/:id/availability
 * @desc    Get a trainer's weekly availability (public — used during booking)
 * @access  Private
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
 * @route   PUT /api/v1/trainer/availability
 * @desc    Set the authenticated trainer's weekly availability
 * @body    { availability: [{ dayOfWeek, startHour, endHour, isActive }] }
 * @access  Private (Trainer only)
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
      const { dayOfWeek, startHour, endHour, isActive = true } = slot;

      if (dayOfWeek === undefined || startHour === undefined || endHour === undefined) {
        return res.status(400).json({ success: false, error: 'Each slot requires dayOfWeek, startHour, endHour' });
      }

      if (endHour <= startHour) {
        return res.status(400).json({ success: false, error: 'endHour must be greater than startHour' });
      }

      const updated = await TrainerAvailability.findOneAndUpdate(
        { trainerId, dayOfWeek },
        { trainerId, dayOfWeek, startHour, endHour, isActive },
        { upsert: true, new: true, runValidators: true }
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

module.exports = router;
