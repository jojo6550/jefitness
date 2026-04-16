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

const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const { requireAdmin, incrementUserTokenVersion } = require('../middleware/auth');
const {
  validateObjectId,
  stripDangerousFields,
  preventNoSQLInjection,
  allowOnlyFields,
} = require('../middleware/inputValidator');
const { logger } = require('../services/logger');

// SECURITY: Apply input validation to all user routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

// Note: Auth middleware is applied at the router level in server.js
// Only role-specific middleware (like requireAdmin) should be at route level

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
// GET /api/users/trainers - Get all trainers with pagination
router.get('/trainers', async (req, res) => {
  try {
    logger.info('Fetching trainers', { userId: req.user.id });

    // Parse pagination parameters with defaults and limits
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await User.countDocuments({ role: 'trainer' });

    // Fetch trainers with pagination
    const trainers = await User.find({
      role: 'trainer',
    })
      .select('firstName lastName email _id')
      .skip(skip)
      .limit(limit)
      .sort({ firstName: 1, lastName: 1 });

    logger.info('Trainers fetched', {
      count: trainers.length,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
    res.json({
      success: true,
      trainers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalTrainers: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    logger.error('Error fetching trainers', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error fetching trainers' });
  }
});

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
// SECURITY: GET /api/users/admins - Get all admins with pagination (admin only)
router.get('/admins', requireAdmin, async (req, res) => {
  try {
    // Parse pagination parameters with defaults and limits
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await User.countDocuments({ role: 'admin' });

    // Fetch admins with pagination
    const admins = await User.find({
      role: 'admin',
    })
      .select('firstName lastName email _id')
      .skip(skip)
      .limit(limit)
      .sort({ firstName: 1, lastName: 1 });

    res.json({
      success: true,
      admins,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalAdmins: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch admins list', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

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
// SECURITY: GET /api/users - Get all users with pagination (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    // Parse pagination parameters with defaults and limits
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Optional search/filter parameters
    const { search, status, role } = req.query;

    // Build query
    const query = {};

    // Add search filter
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Add status filter
    if (status) {
      query.activityStatus = status;
    }

    // Add role filter
    if (role) {
      query.role = role;
    }

    // Get total count for pagination metadata
    const totalCount = await User.countDocuments(query);

    // SECURITY: Exclude sensitive fields AND large embedded arrays from response
    // This prevents fetching workoutLogs, auditLog, etc. which can be very large
    const users = await User.find(query)
      .select(
        '-password -emailVerificationToken -passwordResetToken -pushSubscription -workoutLogs -auditLog -medicalDocuments -purchasedPrograms -assignedPrograms'
      )
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance when we don't need Mongoose documents

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalUsers: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

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
// SECURITY: GET /api/users/profile - Get current user profile
router.get('/profile', async (req, res) => {
  try {
    // SECURITY: Exclude sensitive fields
    const user = await User.findById(req.user.id).select(
      '-password -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json(user);
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

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
// SECURITY: PUT /api/users/:id - Update user profile (with IDOR protection)
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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: errors.array()[0].msg,
        });
      }

      // SECURITY: IDOR Prevention - Users can only update their own profile unless admin
      if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only update your own profile.',
        });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // SECURITY: Only allow specific fields to be updated (whitelist approach)
      const allowedFields = [
        'firstName',
        'lastName',
        'email',
        'goals',
        'reason',
        'phone',
        'gender',
        'dob',
        'activityStatus',
        'startWeight',
        'currentWeight',
      ];
      const updateData = {};

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      // SECURITY: Exclude sensitive fields from response
      const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      }).select(
        '-password -emailVerificationToken -passwordResetToken -pushSubscription'
      );

      res.json({
        success: true,
        user: updatedUser,
      });
    } catch (err) {
      logger.error('User route error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Server error',
      });
    }
  }
);

// SECURITY: DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', requireAdmin, validateObjectId('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

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
// GDPR COMPLIANCE ENDPOINTS

// SECURITY: GET /api/users/data-export - Export user data (GDPR Article 20)
// FIX: Removed allowOnlyFields middleware - GET requests have no body to validate
router.get('/data-export', async (req, res) => {
  try {
    // SECURITY: Exclude sensitive tokens from export
    const user = await User.findById(req.user.id).select(
      '-password -__v -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Structure the data export according to GDPR requirements
    const dataExport = {
      personalInformation: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        gender: user.gender,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      fitnessData: {
        height: user.height,
        weight: user.weight,
        fitnessGoals: user.fitnessGoals,
        activityLevel: user.activityLevel,
        dietaryRestrictions: user.dietaryRestrictions,
      },
      accountData: {
        lastLoggedIn: user.lastLoggedIn,
        emailVerificationToken: user.emailVerificationToken ? 'Present' : 'Not present',
        passwordResetToken: user.passwordResetToken ? 'Present' : 'Not present',
      },
    };

    // Log the data export request for compliance
    logger.logUserAction(
      'gdpr_data_export',
      req.user.id,
      {
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        requestedAt: new Date().toISOString(),
      },
      req
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="jefitness-data-export-${user._id}.json"`
    );
    res.json(dataExport);
  } catch (err) {
    logger.error('GDPR data export error', { userId: req.user.id, error: err.message });
    res.status(500).json({ msg: 'Server error during data export' });
  }
});

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
// DELETE /api/users/data-delete - Delete user data (GDPR Right to Erasure)
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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      // Log the deletion request for compliance and legal purposes
      logger.logUserAction(
        'gdpr_data_deletion',
        req.user.id,
        {
          userName: `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          reason: req.body.reason,
        },
        req
      );

      // Instead of hard deleting, we anonymize the data to maintain referential integrity
      // This is a common GDPR compliance approach
      await User.findByIdAndUpdate(req.user.id, {
        firstName: 'Deleted',
        lastName: 'User',
        email: `deleted-${req.user.id}@jefitness.com`,
        phone: null,
        dob: null,
        gender: null,
        height: null,
        weight: null,
        fitnessGoals: null,
        activityLevel: null,
        dietaryRestrictions: null,
        isEmailVerified: false,
        emailVerificationToken: null,
        passwordResetToken: null,
        lastLoggedIn: null,
        dataDeletedAt: new Date(),
        deletionReason: req.body.reason,
      });

      res.json({
        msg: 'Your data has been successfully deleted in accordance with GDPR regulations',
        deletedAt: new Date(),
        note: 'Your account has been anonymized while maintaining necessary records for legal compliance',
      });
    } catch (err) {
      logger.error('GDPR data deletion error', {
        userId: req.user.id,
        error: err.message,
      });
      res.status(500).json({ msg: 'Server error during data deletion' });
    }
  }
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
// GET /api/users/privacy-settings - Get current privacy settings
// FIX: Removed allowOnlyFields middleware - GET requests have no body to validate
router.get('/privacy-settings', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'privacySettings dataDeletedAt deletionReason'
    );
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({
      privacySettings: user.privacySettings || {
        marketingEmails: false,
        dataAnalytics: true,
        thirdPartySharing: false,
      },
      accountStatus: user.dataDeletedAt ? 'anonymized' : 'active',
      dataDeletedAt: user.dataDeletedAt,
      deletionReason: user.deletionReason,
    });
  } catch (err) {
    logger.error('Privacy settings error', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

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
// POST /api/users/change-password - Change password (requires current password)
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res
          .status(400)
          .json({ success: false, error: 'Current password is incorrect' });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          error: 'New password must differ from current password',
        });
      }

      user.password = newPassword; // pre-save hook hashes it
      await user.save();

      // Invalidate all other sessions
      await incrementUserTokenVersion(req.user.id);

      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (err) {
      logger.error('Change password error', { userId: req.user.id, error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
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
// GET /api/users/measurements - Get body measurements history
router.get('/measurements', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('measurements');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const sorted = (user.measurements || [])
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, measurements: sorted });
  } catch (err) {
    logger.error('Get measurements error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/users/measurements - Add a body measurement entry
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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { date, weight, neck, waist, hips, chest, notes } = req.body;
      const entry = { date: date ? new Date(date) : new Date() };
      if (weight !== undefined) entry.weight = weight;
      if (neck !== undefined) entry.neck = neck;
      if (waist !== undefined) entry.waist = waist;
      if (hips !== undefined) entry.hips = hips;
      if (chest !== undefined) entry.chest = chest;
      if (notes !== undefined) entry.notes = notes;

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $push: { measurements: entry } },
        { new: true, runValidators: false }
      ).select('measurements');

      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      res.status(201).json({ success: true, measurements: user.measurements });
    } catch (err) {
      logger.error('Add measurement error', { userId: req.user.id, error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
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
// DELETE /api/users/measurements/:measurementId - Remove a measurement entry
router.delete('/measurements/:measurementId', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { measurements: { _id: req.params.measurementId } } },
      { new: true }
    ).select('measurements');

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'Measurement deleted' });
  } catch (err) {
    logger.error('Delete measurement error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SECURITY: GET /api/users/:id - Get user by ID (with IDOR protection)
// NOTE: must be declared AFTER all specific GET routes (/profile, /measurements, etc.)
// so Express doesn't match e.g. /measurements as id="measurements" and return 400.
router.get('/:id', validateObjectId('id'), async (req, res) => {
  try {
    // SECURITY: IDOR Prevention - Users can only access their own data unless admin
    if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own profile.',
      });
    }

    // SECURITY: Exclude sensitive fields
    const user = await User.findById(req.params.id).select(
      '-password -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

// PUT /api/users/privacy-settings - Update privacy settings
router.put(
  '/privacy-settings',
  allowOnlyFields(['marketingEmails', 'dataAnalytics', 'thirdPartySharing'], true),
  async (req, res) => {
    try {
      const { marketingEmails, dataAnalytics, thirdPartySharing } = req.body;

      const user = await User.findByIdAndUpdate(
        req.user.id,
        {
          privacySettings: {
            marketingEmails: marketingEmails || false,
            dataAnalytics: dataAnalytics !== false, // Default to true
            thirdPartySharing: thirdPartySharing || false,
          },
        },
        { new: true }
      ).select('privacySettings');

      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      res.json({
        msg: 'Privacy settings updated successfully',
        privacySettings: user.privacySettings,
      });
    } catch (err) {
      logger.error('Privacy settings update error', { error: err.message });
      res.status(500).json({ msg: 'Server error' });
    }
  }
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
  async (req, res) => {
    try {
      const updates = { onboardingCompleted: true };
      const allowed = ['goals', 'reason', 'gender', 'dob', 'height', 'weight'];
      allowed.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      await User.findByIdAndUpdate(req.user.id, updates);
      res.json({ success: true });
    } catch (err) {
      logger.error('Onboarding update error', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

module.exports = router;
