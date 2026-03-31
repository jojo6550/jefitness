const express = require('express');
const router = express.Router();
const trainerController = require('../controllers/trainerController');
const { requireTrainer } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');

/**
 * @route   GET /api/trainer/dashboard
 * @access  Private (Trainer only)
 */
router.get('/dashboard', requireTrainer, trainerController.getDashboard);

/**
 * @route   GET /api/trainer/clients
 * @access  Private (Trainer only)
 */
router.get(
  '/clients',
  requireTrainer,
  requireActiveSubscription,
  trainerController.getClients
);

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

module.exports = router;
