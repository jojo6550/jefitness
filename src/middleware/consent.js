/**
 * GDPR/HIPAA Consent Middleware
 * Ensures users have provided necessary consents for data processing
 */

const User = require('../models/User');
const UserActionLog = require('../models/UserActionLog');
const monitoringService = require('../services/monitoring');

const requireConsent = (consentField, consentType, securityEvent, code, shortError, detailMessage, auditAction, extraAuditData) =>
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User authentication required' });
      }

      // Use user doc pre-fetched by auth middleware to avoid an extra DB query
      const user = req.userDoc || (await User.findById(userId));
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Admin users are exempt from consent requirements — they manage platform data
      if (user.role === 'admin') return next();

      if (!user[consentField].given) {
        monitoringService.recordSecurityEvent(securityEvent, {
          userId,
          consentType,
          endpoint: req.path,
          method: req.method,
        });

        return res.status(403).json({
          success: false,
          error: shortError,
          code,
          details: {
            consentType,
            message: detailMessage,
          },
        });
      }

      // Fire-and-forget audit log — do not block the request
      logAuditEvent(user, auditAction, {
        consentType,
        ...(extraAuditData ? extraAuditData(user) : {}),
        endpoint: req.path,
        method: req.method,
        ipAddress: getClientIP(req),
        userAgent: req.get('User-Agent'),
      });

      next();
    } catch (error) {
      monitoringService.recordError(error, {
        context: `${consentField}_middleware`,
        userId: req.user?.id,
        endpoint: req.path,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error during consent verification',
      });
    }
  };

const requireDataProcessingConsent = requireConsent(
  'dataProcessingConsent',
  'data_processing',
  'consent_required',
  'CONSENT_REQUIRED',
  'Data processing consent required',
  'Please provide consent for data processing before accessing this service',
  'consent_verified'
);

const requireHealthDataConsent = requireConsent(
  'healthDataConsent',
  'health_data',
  'health_consent_required',
  'HEALTH_CONSENT_REQUIRED',
  'Health data processing consent required',
  'Please provide consent for health data processing before accessing health-related features',
  'health_data_accessed',
  user => ({ purpose: user.healthDataConsent.purpose })
);

/**
 * Middleware to check if user has consented to marketing communications
 */
const requireMarketingConsent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
      });
    }

    // Use user doc pre-fetched by auth middleware to avoid an extra DB query
    const user = req.userDoc || (await User.findById(userId));
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.marketingConsent.given || user.marketingConsent.withdrawnAt) {
      return res.status(403).json({
        success: false,
        error: 'Marketing consent required',
        code: 'MARKETING_CONSENT_REQUIRED',
        details: {
          consentType: 'marketing',
          message: 'Marketing consent is required for this action',
        },
      });
    }

    next();
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'marketing_consent_middleware',
      userId: req.user?.id,
      endpoint: req.path,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error during marketing consent verification',
    });
  }
};

/**
 * Middleware to check if data processing is restricted for the user
 */
const checkDataRestriction = async (req, res, next) => {
  try {
    const userId = req.user?.id; // optional chaining kept: unauthenticated requests are allowed through
    if (!userId) {
      return next();
    }

    // Use user doc pre-fetched by auth middleware to avoid an extra DB query
    const user = req.userDoc || (await User.findById(userId));
    if (!user) {
      return next();
    }

    if (user.dataSubjectRights.restrictionRequested) {
      monitoringService.recordSecurityEvent('data_restriction_active', {
        userId,
        endpoint: req.path,
        method: req.method,
      });

      return res.status(403).json({
        success: false,
        error: 'Data processing restricted',
        code: 'DATA_RESTRICTED',
        details: {
          message:
            'Your data processing has been restricted. Please contact support for more information.',
        },
      });
    }

    next();
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'data_restriction_middleware',
      userId: req.user?.id,
      endpoint: req.path,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error during restriction check',
    });
  }
};

/**
 * Helper function to log audit events
 */
const logAuditEvent = async (user, action, details) => {
  try {
    await UserActionLog.logAction(
      user._id,
      action,
      details.ipAddress,
      details.userAgent,
      details
    );
  } catch (error) {
    monitoringService.recordError(error, {
      context: 'audit_logging',
      userId: user._id,
      action,
    });
  }
};

/**
 * Helper function to get client IP address
 */
const getClientIP = req => {
  return (
    req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip']
  );
};

module.exports = {
  requireDataProcessingConsent,
  requireHealthDataConsent,
  requireMarketingConsent,
  checkDataRestriction,
  logAuditEvent,
};
