/**
 * GDPR/HIPAA Compliance Routes
 * Handles data subject rights requests and consent management
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const complianceService = require('../services/compliance');
const monitoringService = require('../services/monitoring');

/**
 * Get user's consent status
 * GET /api/v1/gdpr/consent
 */
router.get('/consent', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const consentStatus = await complianceService.getConsentStatus(userId);

        res.json({
            success: true,
            data: consentStatus
        });
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'get_consent_status',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve consent status'
        });
    }
});

/**
 * Grant data processing consent
 * POST /api/v1/gdpr/consent/data-processing
 */
router.post('/consent/data-processing', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.grantDataProcessingConsent(
            userId,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'grant_data_processing_consent',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to grant data processing consent'
        });
    }
});

/**
 * Grant health data processing consent
 * POST /api/v1/gdpr/consent/health-data
 */
router.post('/consent/health-data', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { purpose } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.grantHealthDataConsent(
            userId,
            purpose,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'grant_health_data_consent',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to grant health data processing consent'
        });
    }
});

/**
 * Grant marketing consent
 * POST /api/v1/gdpr/consent/marketing
 */
router.post('/consent/marketing', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.grantMarketingConsent(
            userId,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'grant_marketing_consent',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to grant marketing consent'
        });
    }
});

/**
 * Withdraw consent
 * DELETE /api/v1/gdpr/consent/:consentType
 */
router.delete('/consent/:consentType', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { consentType } = req.params;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const validConsentTypes = ['data_processing', 'health_data', 'marketing'];
        if (!validConsentTypes.includes(consentType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid consent type'
            });
        }

        const result = await complianceService.withdrawConsent(
            userId,
            consentType,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'withdraw_consent',
            userId: req.user.id,
            consentType: req.params.consentType,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to withdraw consent'
        });
    }
});

/**
 * Request data access (GDPR Article 15)
 * POST /api/v1/gdpr/data-access
 */
router.post('/data-access', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.requestDataAccess(
            userId,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'request_data_access',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit data access request'
        });
    }
});

/**
 * Request data rectification (GDPR Article 16)
 * PUT /api/v1/gdpr/data-rectification
 */
router.put('/data-rectification', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { rectificationData } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        if (!rectificationData || typeof rectificationData !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Rectification data is required'
            });
        }

        const result = await complianceService.requestDataRectification(
            userId,
            rectificationData,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'request_data_rectification',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit data rectification request'
        });
    }
});

/**
 * Request data erasure (GDPR Article 17 - Right to be Forgotten)
 * DELETE /api/v1/gdpr/data-erasure
 */
router.delete('/data-erasure', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { reason } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.requestDataErasure(
            userId,
            reason,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'request_data_erasure',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit data erasure request'
        });
    }
});

/**
 * Request data portability (GDPR Article 20)
 * POST /api/v1/gdpr/data-portability
 */
router.post('/data-portability', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        const result = await complianceService.requestDataPortability(
            userId,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'request_data_portability',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit data portability request'
        });
    }
});

/**
 * Object to processing (GDPR Article 21)
 * POST /api/v1/gdpr/object-to-processing
 */
router.post('/object-to-processing', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { reason } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Reason for objection is required'
            });
        }

        const result = await complianceService.objectToProcessing(
            userId,
            reason,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'object_to_processing',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit processing objection'
        });
    }
});

/**
 * Request processing restriction (GDPR Article 18)
 * POST /api/v1/gdpr/restrict-processing
 */
router.post('/restrict-processing', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { reason } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Reason for restriction is required'
            });
        }

        const result = await complianceService.requestProcessingRestriction(
            userId,
            reason,
            ipAddress,
            userAgent
        );

        res.json(result);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'request_processing_restriction',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to submit processing restriction request'
        });
    }
});

/**
 * Get data processing audit log
 * GET /api/v1/gdpr/audit-log
 */
router.get('/audit-log', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { limit = 50, offset = 0 } = req.query;

        const user = await require('../models/User').findById(userId)
            .select('auditLog')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const auditLog = user.auditLog
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            success: true,
            data: {
                auditLog,
                total: user.auditLog.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'get_audit_log',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit log'
        });
    }
});

/**
 * Admin endpoint: Process data retention cleanup
 * POST /api/v1/gdpr/admin/retention-cleanup
 */
router.post('/admin/retention-cleanup', auth, async (req, res) => {
    try {
        // Check if user is admin
        const userId = req.user.id || req.user.user.id;
        const user = await require('../models/User').findById(userId);

        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const result = await complianceService.performDataRetentionCleanup();

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'admin_retention_cleanup',
            userId: req.user.id,
            endpoint: req.path
        });

        res.status(500).json({
            success: false,
            error: 'Failed to perform retention cleanup'
        });
    }
});

module.exports = router;
