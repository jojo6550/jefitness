/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile management, measurements, privacy, and GDPR data operations
 *
 * @swagger
 * components:
 *   schemas:
 *     Measurement:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date-time
 *         weight:
 *           type: number
 *         neck:
 *           type: number
 *         waist:
 *           type: number
 *         hips:
 *           type: number
 *         chest:
 *           type: number
 *         notes:
 *           type: string
 *     PrivacySettings:
 *       type: object
 *       properties:
 *         marketingEmails:
 *           type: boolean
 *         dataAnalytics:
 *           type: boolean
 *         thirdPartySharing:
 *           type: boolean
 */

const express = require('express');

const { body } = require('express-validator');

const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  validateObjectId,
  stripDangerousFields,
  preventNoSQLInjection,
  allowOnlyFields,
} = require('../middleware/inputValidator');
const ctrl = require('../controllers/userController');

// SECURITY: Apply input validation to all user routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

// Auth middleware is applied at the router level in server.js.
// Only role-specific middleware (like requireAdmin) is attached at the route level.

/**
 * @swagger
 * /users/trainers:
 *   get:
 *     summary: Get all trainers with pagination
 *     tags: [Users]
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
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated trainer list
 *       500:
 *         description: Server error
 */
router.get('/trainers', ctrl.getTrainers);

/**
 * @swagger
 * /users/admins:
 *   get:
 *     summary: Get all admin users with pagination (admin only)
 *     tags: [Users]
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
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated admin list
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/admins', requireAdmin, ctrl.getAdmins);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users with pagination and optional search/filter (admin only)
 *     tags: [Users]
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
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by activityStatus
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, trainer, admin]
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/', requireAdmin, ctrl.getAllUsers);

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get the current authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/profile', ctrl.getProfile);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update a user's profile (own profile only, or admin)
 *     tags: [Users]
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
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               goals:
 *                 type: string
 *               reason:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *               activityStatus:
 *                 type: string
 *               startWeight:
 *                 type: number
 *               currentWeight:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated user profile
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete a user (admin only)
 *     tags: [Users]
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
 *         description: User deleted
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 *   get:
 *     summary: Get a user by ID (own data only, or admin)
 *     tags: [Users]
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
 *         description: User data
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put(
  '/:id',
  validateObjectId('id'),
  [
    body('firstName')
      .optional()
      .isLength({ min: 1 })
      .withMessage('First name is required'),
    body('lastName').optional().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').optional().isEmail().withMessage('Please include a valid email'),
    body('goals').optional().isString().withMessage('Goals must be a string'),
  ],
  ctrl.updateUserById
);

router.delete('/:id', requireAdmin, validateObjectId('id'), ctrl.deleteUserById);

/**
 * @swagger
 * /users/data-export:
 *   get:
 *     summary: Export all personal data for the current user (GDPR Article 20)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON data export attachment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/data-export', ctrl.exportData);

/**
 * @swagger
 * /users/data-delete:
 *   delete:
 *     summary: Anonymize/delete all personal data (GDPR Right to Erasure)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmation
 *               - reason
 *             properties:
 *               confirmation:
 *                 type: string
 *                 description: Must be the literal string "DELETE ALL MY DATA"
 *                 example: DELETE ALL MY DATA
 *               reason:
 *                 type: string
 *                 enum: [withdraw_consent, no_longer_needed, other]
 *     responses:
 *       200:
 *         description: Account anonymized
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete(
  '/data-delete',
  [
    body('confirmation', 'Confirmation text is required').equals('DELETE ALL MY DATA'),
    body('reason', 'Deletion reason is required').isIn([
      'withdraw_consent',
      'no_longer_needed',
      'other',
    ]),
  ],
  ctrl.deleteAllData
);

/**
 * @swagger
 * /users/privacy-settings:
 *   get:
 *     summary: Get the current user's privacy settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 privacySettings:
 *                   $ref: '#/components/schemas/PrivacySettings'
 *                 accountStatus:
 *                   type: string
 *                 dataDeletedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 *   put:
 *     summary: Update the current user's privacy settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrivacySettings'
 *     responses:
 *       200:
 *         description: Privacy settings updated
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/privacy-settings', ctrl.getPrivacySettings);

/**
 * @swagger
 * /users/change-password:
 *   post:
 *     summary: Change the current user's password (invalidates all other sessions)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error or current password incorrect
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
  ],
  ctrl.changePassword
);

/**
 * @swagger
 * /users/measurements:
 *   get:
 *     summary: Get body measurements history for the current user (sorted newest first)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Measurements list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 measurements:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Measurement'
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 *   post:
 *     summary: Add a new body measurement entry
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Measurement'
 *     responses:
 *       201:
 *         description: Measurement added
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/measurements', ctrl.getMeasurements);

router.post(
  '/measurements',
  allowOnlyFields(['date', 'weight', 'neck', 'waist', 'hips', 'chest', 'notes'], true),
  [
    body('weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Weight must be a positive number'),
    body('neck').optional().isFloat({ min: 0 }),
    body('waist').optional().isFloat({ min: 0 }),
    body('hips').optional().isFloat({ min: 0 }),
    body('chest').optional().isFloat({ min: 0 }),
    body('notes').optional().isLength({ max: 200 }),
  ],
  ctrl.addMeasurement
);

/**
 * @swagger
 * /users/measurements/{measurementId}:
 *   delete:
 *     summary: Delete a measurement entry
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: measurementId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Measurement deleted
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/measurements/:measurementId', ctrl.deleteMeasurement);

// GET /:id must be declared AFTER all specific GET routes (/profile, /measurements, etc.)
// so Express doesn't match e.g. /measurements as id="measurements" and return 400.
router.get('/:id', validateObjectId('id'), ctrl.getUserById);

router.put(
  '/privacy-settings',
  allowOnlyFields(['marketingEmails', 'dataAnalytics', 'thirdPartySharing'], true),
  ctrl.updatePrivacySettings
);

/**
 * @swagger
 * /users/onboarding:
 *   post:
 *     summary: Mark onboarding as complete and save initial user data
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goals:
 *                 type: string
 *               reason:
 *                 type: string
 *               gender:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *               height:
 *                 type: number
 *               weight:
 *                 type: number
 *     responses:
 *       200:
 *         description: Onboarding completed
 *       500:
 *         description: Server error
 */
router.post(
  '/onboarding',
  allowOnlyFields(['goals', 'reason', 'gender', 'dob', 'height', 'weight'], true),
  ctrl.completeOnboarding
);

module.exports = router;
