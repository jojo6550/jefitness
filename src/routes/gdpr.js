/**
 * GDPR/HIPAA Compliance Routes
 * Handles data subject rights requests and consent management
 *
 * @swagger
 * tags:
 *   name: GDPR
 *   description: GDPR/HIPAA compliance — consent management and data subject rights
 *
 * @swagger
 * components:
 *   schemas:
 *     ConsentStatus:
 *       type: object
 *       properties:
 *         dataProcessing:
 *           type: boolean
 *         healthData:
 *           type: boolean
 *         marketing:
 *           type: boolean
 *     AuditLogEntry:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         userId:
 *           type: string
 *         action:
 *           type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *         ip:
 *           type: string
 *         userAgent:
 *           type: string
 */

const express = require('express');
const router = express.Router();
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

const complianceService = require('../services/compliance');
const monitoringService = require('../services/monitoring');
const UserActionLog = require('../models/UserActionLog');

/**
 * @swagger
 * /gdpr/consent:
 *   get:
 *     summary: Get current user's consent status
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consent status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ConsentStatus'
 *       500:
 *         description: Server error
 */
router.get('/consent', async (req, res) => {
  try {
    const userId = req.user.id || req.user.user.id;
    const consentStatus = await complianceService.getConsentStatus(userId);

    res.json({
      success: true,
      data: consentStatus,
    });
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'get_consent_status',
      userId: req.user.id,
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve consent status',
    });
  }
});

/**
 * @swagger
 * /gdpr/consent/data-processing:
 *   post:
 *     summary: Grant data processing consent (GDPR)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consent granted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to grant data processing consent',
    });
  }
});

/**
 * @swagger
 * /gdpr/consent/health-data:
 *   post:
 *     summary: Grant health data processing consent (GDPR)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               purpose:
 *                 type: string
 *                 description: Purpose for health data processing
 *     responses:
 *       200:
 *         description: Health data consent granted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to grant health data processing consent',
    });
  }
});

/**
 * @swagger
 * /gdpr/consent/marketing:
 *   post:
 *     summary: Grant marketing consent (GDPR)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marketing consent granted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to grant marketing consent',
    });
  }
});

/**
 * @swagger
 * /gdpr/consent/{consentType}:
 *   delete:
 *     summary: Withdraw a previously granted consent (GDPR)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consentType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [data_processing, health_data, marketing]
 *         description: Type of consent to withdraw
 *     responses:
 *       200:
 *         description: Consent withdrawn
 *       400:
 *         description: Invalid consent type
 *       500:
 *         description: Server error
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
        error: 'Invalid consent type',
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to withdraw consent',
    });
  }
});

/**
 * @swagger
 * /gdpr/data-access:
 *   post:
 *     summary: Request data access (GDPR Article 15 — Right of Access)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data access request submitted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit data access request',
    });
  }
});

/**
 * @swagger
 * /gdpr/data-rectification:
 *   put:
 *     summary: Request data rectification (GDPR Article 16 — Right to Rectification)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rectificationData
 *             properties:
 *               rectificationData:
 *                 type: object
 *                 description: Fields and corrected values to be rectified
 *     responses:
 *       200:
 *         description: Rectification request submitted
 *       400:
 *         description: Rectification data is required
 *       500:
 *         description: Server error
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
        error: 'Rectification data is required',
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit data rectification request',
    });
  }
});

/**
 * @swagger
 * /gdpr/data-erasure:
 *   delete:
 *     summary: Request data erasure (GDPR Article 17 — Right to be Forgotten)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for requesting erasure
 *     responses:
 *       200:
 *         description: Data erasure request submitted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit data erasure request',
    });
  }
});

/**
 * @swagger
 * /gdpr/data-portability:
 *   post:
 *     summary: Request data portability (GDPR Article 20 — Right to Data Portability)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data portability request submitted
 *       500:
 *         description: Server error
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit data portability request',
    });
  }
});

/**
 * @swagger
 * /gdpr/object-to-processing:
 *   post:
 *     summary: Object to data processing (GDPR Article 21)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for objecting to processing
 *     responses:
 *       200:
 *         description: Objection submitted
 *       400:
 *         description: Reason is required
 *       500:
 *         description: Server error
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
        error: 'Reason for objection is required',
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit processing objection',
    });
  }
});

/**
 * @swagger
 * /gdpr/restrict-processing:
 *   post:
 *     summary: Request processing restriction (GDPR Article 18 — Right to Restriction)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for requesting processing restriction
 *     responses:
 *       200:
 *         description: Restriction request submitted
 *       400:
 *         description: Reason is required
 *       500:
 *         description: Server error
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
        error: 'Reason for restriction is required',
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
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit processing restriction request',
    });
  }
});

/**
 * @swagger
 * /gdpr/audit-log:
 *   get:
 *     summary: Get the data processing audit log for the current user
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of entries to skip
 *     responses:
 *       200:
 *         description: Audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     auditLog:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AuditLogEntry'
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *       500:
 *         description: Server error
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
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'get_audit_log',
      userId: req.user.id,
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit log',
    });
  }
});

/**
 * @swagger
 * /gdpr/admin/retention-cleanup:
 *   post:
 *     summary: Trigger data retention cleanup (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Retention cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/admin/retention-cleanup', async (req, res) => {
  try {
    // Check if user is admin
    const userId = req.user.id || req.user.user.id;
    const user = await require('../models/User').findById(userId);

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await complianceService.performDataRetentionCleanup();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'admin_retention_cleanup',
      userId: req.user.id,
      endpoint: req.path,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to perform retention cleanup',
    });
  }
});

module.exports = router;
