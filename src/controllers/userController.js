const { validationResult } = require('express-validator');

const User = require('../models/User');
const { incrementUserTokenVersion } = require('../middleware/auth');
const { logger } = require('../services/logger');

/**
 * GET /users/trainers — Paginated trainer list.
 */
async function getTrainers(req, res) {
  try {
    logger.info('Fetching trainers', { userId: req.user.id });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const totalCount = await User.countDocuments({ role: 'trainer' });

    const trainers = await User.find({ role: 'trainer' })
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
}

/**
 * GET /users/admins — Paginated admin list (admin-only; middleware enforces).
 */
async function getAdmins(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const totalCount = await User.countDocuments({ role: 'admin' });

    const admins = await User.find({ role: 'admin' })
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
}

/**
 * GET /users — Paginated user list with optional search/status/role filter (admin-only).
 */
async function getAllUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const { search, status, role } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) query.activityStatus = status;
    if (role) query.role = role;

    const totalCount = await User.countDocuments(query);

    // SECURITY: Exclude sensitive fields AND large embedded arrays
    const users = await User.find(query)
      .select(
        '-password -emailVerificationToken -passwordResetToken -pushSubscription -workoutLogs -auditLog -medicalDocuments -purchasedPrograms -assignedPrograms'
      )
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

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
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * GET /users/profile — Current user's profile.
 */
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      '-password -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * PUT /users/:id — Update a user profile (own or admin). IDOR-protected.
 */
async function updateUserById(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    // IDOR: only self or admin
    if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own profile.',
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

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
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select('-password -emailVerificationToken -passwordResetToken -pushSubscription');

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * DELETE /users/:id — Admin-only hard delete.
 */
async function deleteUserById(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * GET /users/data-export — GDPR Article 20 data export.
 */
async function exportData(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      '-password -__v -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

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
}

/**
 * DELETE /users/data-delete — GDPR Right to Erasure anonymisation.
 */
async function deleteAllData(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

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

/**
 * GET /users/privacy-settings — Current privacy settings.
 */
async function getPrivacySettings(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      'privacySettings dataDeletedAt deletionReason'
    );
    if (!user) return res.status(404).json({ msg: 'User not found' });

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
}

/**
 * PUT /users/privacy-settings — Update current privacy settings.
 */
async function updatePrivacySettings(req, res) {
  try {
    const { marketingEmails, dataAnalytics, thirdPartySharing } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        privacySettings: {
          marketingEmails: marketingEmails || false,
          dataAnalytics: dataAnalytics !== false,
          thirdPartySharing: thirdPartySharing || false,
        },
      },
      { new: true }
    ).select('privacySettings');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    res.json({
      msg: 'Privacy settings updated successfully',
      privacySettings: user.privacySettings,
    });
  } catch (err) {
    logger.error('Privacy settings update error', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
}

/**
 * POST /users/change-password — Change password + invalidate sessions.
 */
async function changePassword(req, res) {
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

    user.password = newPassword;
    await user.save();

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

/**
 * GET /users/measurements — Body measurements history (sorted newest first).
 */
async function getMeasurements(req, res) {
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
}

/**
 * POST /users/measurements — Add measurement entry.
 */
async function addMeasurement(req, res) {
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

/**
 * DELETE /users/measurements/:measurementId — Remove a single measurement entry.
 */
async function deleteMeasurement(req, res) {
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
}

/**
 * GET /users/:id — Get user by id (self or admin).
 */
async function getUserById(req, res) {
  try {
    if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own profile.',
      });
    }

    const user = await User.findById(req.params.id).select(
      '-password -emailVerificationToken -passwordResetToken -pushSubscription'
    );
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    logger.error('User route error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * POST /users/onboarding — Complete onboarding and save initial user data.
 */
async function completeOnboarding(req, res) {
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

module.exports = {
  getTrainers,
  getAdmins,
  getAllUsers,
  getProfile,
  updateUserById,
  deleteUserById,
  exportData,
  deleteAllData,
  getPrivacySettings,
  updatePrivacySettings,
  changePassword,
  getMeasurements,
  addMeasurement,
  deleteMeasurement,
  getUserById,
  completeOnboarding,
};
