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

// Note: Auth middleware is applied at the router level in server.js
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { requireAdmin } = require('../middleware/auth');
const { allowOnlyFields } = require('../middleware/inputValidator');
const appointmentController = require('../controllers/appointmentController');

/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: Get all appointments with pagination and filtering (admin only)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create a new appointment booking (requires active subscription)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', requireAdmin, appointmentController.listAppointments);
router.post('/', requireActiveSubscription, appointmentController.createAppointment);

/**
 * @swagger
 * /appointments/user:
 *   get:
 *     summary: Get all appointments for the authenticated user (as client or trainer)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/user', appointmentController.getUserAppointments);

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get a specific appointment by ID (participant or admin only)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Update an appointment (admin only via this route)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete an appointment (trainer, client, or admin)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', appointmentController.getAppointmentById);
router.put(
  '/:id',
  allowOnlyFields(['trainerId', 'date', 'time', 'status', 'notes'], true),
  appointmentController.updateAppointment
);
router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
