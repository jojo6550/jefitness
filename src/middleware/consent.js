/**
 * GDPR/HIPAA Consent Middleware
 * Ensures users have provided necessary consents for data processing
 */

const User = require('../models/User');
const UserActionLog = require('../models/UserActionLog');
const monitoringService = require('../services/monitoring');

/**
 * Middleware to check if user has given general data processing consent
 */
const requireDataProcessingConsent = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.dataProcessingConsent.given) {
            monitoringService.recordSecurityEvent('consent_required', {
                userId,
                consentType: 'data_processing',
                endpoint: req.path,
                method: req.method
            });

            return res.status(403).json({
                success: false,
                error: 'Data processing consent required',
                code: 'CONSENT_REQUIRED',
                details: {
                    consentType: 'data_processing',
                    message: 'Please provide consent for data processing before accessing this service'
                }
            });
        }

        // Log consent verification
        await logAuditEvent(user, 'consent_verified', {
            consentType: 'data_processing',
            endpoint: req.path,
            method: req.method,
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent')
        });

        next();
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'consent_middleware',
            userId: req.user?.id,
            endpoint: req.path
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error during consent verification'
        });
    }
};

/**
 * Middleware to check if user has given health data processing consent
 */
const requireHealthDataConsent = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.healthDataConsent.given) {
            monitoringService.recordSecurityEvent('health_consent_required', {
                userId,
                consentType: 'health_data',
                endpoint: req.path,
                method: req.method
            });

            return res.status(403).json({
                success: false,
                error: 'Health data processing consent required',
                code: 'HEALTH_CONSENT_REQUIRED',
                details: {
                    consentType: 'health_data',
                    message: 'Please provide consent for health data processing before accessing health-related features'
                }
            });
        }

        // Log health data access
        try {
            await logAuditEvent(user, 'health_data_accessed', {
                consentType: 'health_data',
                purpose: user.healthDataConsent.purpose,
                endpoint: req.path,
                method: req.method,
                ipAddress: getClientIP(req),
                userAgent: req.get('User-Agent')
            });
        } catch (logError) {
            monitoringService.recordError(logError, {
                context: 'health_data_access_logging',
                userId: user._id,
                endpoint: req.path
            });
        }

        next();
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'health_consent_middleware',
            userId: req.user?.id,
            endpoint: req.path
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error during health consent verification'
        });
    }
};

/**
 * Middleware to check if user has consented to marketing communications
 */
const requireMarketingConsent = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.marketingConsent.given || user.marketingConsent.withdrawnAt) {
            return res.status(403).json({
                success: false,
                error: 'Marketing consent required',
                code: 'MARKETING_CONSENT_REQUIRED',
                details: {
                    consentType: 'marketing',
                    message: 'Marketing consent is required for this action'
                }
            });
        }

        next();
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'marketing_consent_middleware',
            userId: req.user?.id,
            endpoint: req.path
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error during marketing consent verification'
        });
    }
};

/**
 * Middleware to check if data processing is restricted for the user
 */
const checkDataRestriction = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?.user?.id;
        if (!userId) {
            return next();
        }

        const user = await User.findById(userId);
        if (!user) {
            return next();
        }

        if (user.dataSubjectRights.restrictionRequested) {
            monitoringService.recordSecurityEvent('data_restriction_active', {
                userId,
                endpoint: req.path,
                method: req.method
            });

            return res.status(403).json({
                success: false,
                error: 'Data processing restricted',
                code: 'DATA_RESTRICTED',
                details: {
                    message: 'Your data processing has been restricted. Please contact support for more information.'
                }
            });
        }

        next();
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'data_restriction_middleware',
            userId: req.user?.id,
            endpoint: req.path
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error during restriction check'
        });
    }
};

/**
 * Helper function to log audit events
 */
const logAuditEvent = async (user, action, details) => {
    try {
        await UserActionLog.logAction(user._id, action, details.ipAddress, details.userAgent, details);
    } catch (error) {
        monitoringService.recordError(error, {
            context: 'audit_logging',
            userId: user._id,
            action
        });
    }
};

/**
 * Helper function to get client IP address
 */
const getClientIP = (req) => {
    return req.ip ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'];
};

module.exports = {
    requireDataProcessingConsent,
    requireHealthDataConsent,
    requireMarketingConsent,
    checkDataRestriction,
    logAuditEvent
};
