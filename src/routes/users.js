const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/users/trainers - Get all trainers
router.get('/trainers', auth, async (req, res) => {
    try {
        const trainers = await User.find({
            role: 'admin'
        }).select('firstName lastName email _id');
        res.json(trainers);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GDPR COMPLIANCE ENDPOINTS

// GET /api/users/data-export - Export user data (GDPR Article 20)
router.get('/data-export', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -__v');
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
                dateOfBirth: user.dateOfBirth,
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
                passwordResetToken: user.passwordResetToken ? 'Present' : 'Not present'
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
            passwordResetToken: null,
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
router.put('/privacy-settings', auth, async (req, res) => {
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
