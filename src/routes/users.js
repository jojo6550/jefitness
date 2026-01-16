const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, requireAdmin } = require('../middleware/auth');
const { validateObjectId, stripDangerousFields, preventNoSQLInjection, allowOnlyFields } = require('../middleware/inputValidator');

// SECURITY: Apply input validation to all user routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

// GET /api/users/trainers - Get all trainers
router.get('/trainers', auth, async (req, res) => {
    try {
        console.log(`Fetching trainers for user: ${req.user.id}`);
        const trainers = await User.find({
            role: 'trainer'
        }).select('firstName lastName email _id');

        console.log(`Found ${trainers.length} trainers`);
        res.json({
            success: true,
            trainers
        });
    } catch (err) {
        console.error('Error fetching trainers:', err);
        console.error('Stack trace:', err.stack);
        res.status(500).json({ error: 'Server error fetching trainers' });
    }
});

// SECURITY: GET /api/users/admins - Get all admins (admin only)
router.get('/admins', auth, requireAdmin, async (req, res) => {
    try {
        const admins = await User.find({
            role: 'admin'
        }).select('firstName lastName email _id');
        res.json({ success: true, admins });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// SECURITY: GET /api/users - Get all users (admin only)
router.get('/', auth, requireAdmin, async (req, res) => {
    try {
        // SECURITY: Exclude sensitive fields from response
        const users = await User.find().select('-password -emailVerificationToken -resetToken -pushSubscription');
        res.json({
            success: true,
            users
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// SECURITY: GET /api/users/:id - Get user by ID (with IDOR protection)
router.get('/:id', auth, validateObjectId('id'), async (req, res) => {
    try {
        // SECURITY: IDOR Prevention - Users can only access their own data unless admin
        if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You can only access your own profile.'
            });
        }

        // SECURITY: Exclude sensitive fields
        const user = await User.findById(req.params.id).select('-password -emailVerificationToken -resetToken -pushSubscription');
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// SECURITY: PUT /api/users/:id - Update user profile (with IDOR protection)
router.put('/:id', auth, validateObjectId('id'), [
    body('firstName').optional().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').optional().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').optional().isEmail().withMessage('Please include a valid email'),
    body('goals').optional().isString().withMessage('Goals must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        // SECURITY: IDOR Prevention - Users can only update their own profile unless admin
        if (req.user.role !== 'admin' && req.params.id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. You can only update your own profile.'
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // SECURITY: Only allow specific fields to be updated (whitelist approach)
        const allowedFields = ['firstName', 'lastName', 'email', 'goals', 'phone', 'gender', 'dob'];
        const updateData = {};
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        // SECURITY: Exclude sensitive fields from response
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true, runValidators: true }
        ).select('-password -emailVerificationToken -resetToken -pushSubscription');

        res.json({
            success: true,
            user: updatedUser
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// SECURITY: DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', auth, requireAdmin, validateObjectId('id'), async (req, res) => {
    try {

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        await User.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// GDPR COMPLIANCE ENDPOINTS

// SECURITY: GET /api/users/data-export - Export user data (GDPR Article 20)
// FIX: Removed allowOnlyFields middleware - GET requests have no body to validate
router.get('/data-export', auth, async (req, res) => {
    try {
        // SECURITY: Exclude sensitive tokens from export
        const user = await User.findById(req.user.id).select('-password -__v -emailVerificationToken -resetToken -pushSubscription');
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
                updatedAt: user.updatedAt
            },
            fitnessData: {
                height: user.height,
                weight: user.weight,
                fitnessGoals: user.fitnessGoals,
                activityLevel: user.activityLevel,
                dietaryRestrictions: user.dietaryRestrictions
            },
            accountData: {
                lastLogin: user.lastLogin,
                emailVerificationToken: user.emailVerificationToken ? 'Present' : 'Not present',
                resetToken: user.resetToken ? 'Present' : 'Not present'
            }
        };

        // Log the data export request for compliance
        console.log(`GDPR Data Export: User ${req.user.id} requested data export at ${new Date().toISOString()}`);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="jefitness-data-export-${user._id}.json"`);
        res.json(dataExport);
    } catch (err) {
        console.error('GDPR Data Export Error:', err.message);
        res.status(500).json({ msg: 'Server error during data export' });
    }
});

// DELETE /api/users/data-delete - Delete user data (GDPR Right to Erasure)
router.delete('/data-delete', auth, [
    body('confirmation', 'Confirmation text is required').equals('DELETE ALL MY DATA'),
    body('reason', 'Deletion reason is required').isIn(['withdraw_consent', 'no_longer_needed', 'other'])
], async (req, res) => {
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
        console.log(`GDPR Data Deletion: User ${req.user.id} (${user.email}) requested data deletion. Reason: ${req.body.reason}`);

        // Instead of hard deleting, we anonymize the data to maintain referential integrity
        // This is a common GDPR compliance approach
        await User.findByIdAndUpdate(req.user.id, {
            firstName: 'Deleted',
            lastName: 'User',
            email: `deleted-${req.user.id}@jefitness.com`,
            phone: null,
            dateOfBirth: null,
            gender: null,
            height: null,
            weight: null,
            fitnessGoals: null,
            activityLevel: null,
            dietaryRestrictions: null,
            isEmailVerified: false,
            emailVerificationToken: null,
            resetToken: null,
            lastLogin: null,
            dataDeletedAt: new Date(),
            deletionReason: req.body.reason
        });

        res.json({
            msg: 'Your data has been successfully deleted in accordance with GDPR regulations',
            deletedAt: new Date(),
            note: 'Your account has been anonymized while maintaining necessary records for legal compliance'
        });
    } catch (err) {
        console.error('GDPR Data Deletion Error:', err.message);
        res.status(500).json({ msg: 'Server error during data deletion' });
    }
});

// GET /api/users/privacy-settings - Get current privacy settings
// FIX: Removed allowOnlyFields middleware - GET requests have no body to validate
router.get('/privacy-settings', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('privacySettings dataDeletedAt deletionReason');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
            privacySettings: user.privacySettings || {
                marketingEmails: false,
                dataAnalytics: true,
                thirdPartySharing: false
            },
            accountStatus: user.dataDeletedAt ? 'anonymized' : 'active',
            dataDeletedAt: user.dataDeletedAt,
            deletionReason: user.deletionReason
        });
    } catch (err) {
        console.error('Privacy Settings Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// PUT /api/users/privacy-settings - Update privacy settings
router.put('/privacy-settings', auth, allowOnlyFields(['marketingEmails', 'dataAnalytics', 'thirdPartySharing'], true), async (req, res) => {
    try {
        const { marketingEmails, dataAnalytics, thirdPartySharing } = req.body;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            {
                privacySettings: {
                    marketingEmails: marketingEmails || false,
                    dataAnalytics: dataAnalytics !== false, // Default to true
                    thirdPartySharing: thirdPartySharing || false
                }
            },
            { new: true }
        ).select('privacySettings');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
            msg: 'Privacy settings updated successfully',
            privacySettings: user.privacySettings
        });
    } catch (err) {
        console.error('Privacy Settings Update Error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;