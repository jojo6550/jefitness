/**
 * GDPR/HIPAA Compliance Routes
 * Handles data subject rights requests and consent management
 */

const express = require('express');
const router = express.Router();
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

const complianceService = require('../services/compliance');
const monitoringService = require('../services/monitoring');
const UserActionLog = require('../models/UserActionLog');


/**
 * Get user's consent status
 * GET /api/v1/gdpr/consent
 * Note: Auth is applied at router level in server.js
 */
router.get('/consent', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/consent/data-processing', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/consent/health-data', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/consent/marketing', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.delete('/consent/:consentType', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/data-access', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.put('/data-rectification', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.delete('/data-erasure', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/data-portability', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/object-to-processing', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/restrict-processing', async (req, res) => {
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
 * Note: Auth is applied at router level in server.js
 */
router.get('/audit-log', async (req, res) => {
    try {
        const userId = req.user.id || req.user.user.id;
        const { limit = 50, offset = 0 } = req.query;

        // Get total count for pagination
        const total = await UserActionLog.countDocuments({ userId });

        // Get paginated logs from UserActionLog collection
        const auditLog = await UserActionLog.find({ userId })
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .lean();

        res.json({
            success: true,
            data: {
                auditLog,
                total,
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
 * Note: Auth is applied at router level in server.js
 */
router.post('/admin/retention-cleanup', async (req, res) => {
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
