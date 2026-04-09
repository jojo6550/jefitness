const path = require('path');

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const Log = require('../models/Log');

/**
 * Centralized Structured Winston Logger for JE Fitness
 * Structured JSON logs + DB audit for security + rotation
 */
class Logger {
  constructor() {
    this.service = 'jefitness'; // Must be set before _createWinstonLogger uses it
    this.logger = this._createWinstonLogger();
  }

  _createWinstonLogger() {
    const logDir = path.join(__dirname, '..', '..', 'logs');

    const transports = [
      // Error logs
      new DailyRotateFile({
        filename: path.join(logDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '10m',
        maxFiles: '30d',
        level: 'error',
      }),
      // Combined logs
      new DailyRotateFile({
        filename: path.join(logDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ];

    // Console transport (dev pretty, prod JSON — visible in Render dashboard logs)
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        })
      );
    } else {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.service },
      transports,
    });
  }

  info(msg, meta = {}) {
    const fullMeta = { level: 'info', ...meta };
    const readableMsg = this._formatMessage(msg, fullMeta);
    this.logger.info(msg, fullMeta);
    this._asyncLogToDB('info', readableMsg, fullMeta);
  }

  warn(msg, meta = {}) {
    const fullMeta = { level: 'warn', ...meta };
    const readableMsg = this._formatMessage(msg, fullMeta);
    this.logger.warn(msg, fullMeta);
    this._asyncLogToDB('warn', readableMsg, fullMeta);
  }

  error(msg, meta = {}) {
    const fullMeta = { level: 'error', ...meta };
    const readableMsg = this._formatMessage(msg, fullMeta);
    this.logger.error(msg, fullMeta);
    this._asyncLogToDB('error', readableMsg, fullMeta);
  }

  debug(msg, meta = {}) {
    const fullMeta = { level: 'debug', ...meta };
    const readableMsg = this._formatMessage(msg, fullMeta);
    this.logger.debug(msg, fullMeta);
    this._asyncLogToDB('debug', readableMsg, fullMeta);
  }

  http(msg, meta = {}) {
    const fullMeta = { level: 'http', ...meta };
    const readableMsg = this._formatMessage(msg, fullMeta);
    this.logger.http(msg, fullMeta);
    this._asyncLogToDB('http', readableMsg, fullMeta);
  }

  // Convenience methods
  logUserAction(action, userId, details = {}, req = null) {
    const message = this._buildHumanMessage(action, details);
    const meta = {
      category: 'user',
      userId,
      action,
      details,
      ...(req ? this._reqContext(req) : {}),
    };
    this.logger.info(message, meta);
    this._asyncLogToDB('info', message, meta);
  }

  logAdminAction(action, adminId, details = {}) {
    const message = this._buildHumanMessage(action, details);
    const meta = {
      category: 'admin',
      userId: adminId,
      action,
      details,
    };
    this.logger.info(message, meta);
    this._asyncLogToDB('info', message, meta);
  }

  async logSecurityEvent(eventType, userId, details = {}, req = null) {
    const securityMeta = {
      category: 'security',
      eventType,
      userId,
      severity: this._getSecuritySeverity(eventType),
      ...details,
      ...(req ? this._reqContext(req) : {}),
    };

    this.warn(`Security Event: ${eventType}`, securityMeta);
    await this._logToDB('warn', `Security: ${eventType}`, securityMeta);

    if (this._isCriticalSecurityEvent(eventType)) {
      // Trigger alerts
      this.error('CRITICAL SECURITY EVENT', securityMeta);
    }
  }

  // Private helpers
  _formatMessage(msg, meta = {}) {
    // Skip formatting if already formatted (no metadata) or very short
    if (!meta || Object.keys(meta).length <= 1 || msg.length > 100) {
      return msg;
    }
    // For simple messages with context, add formatted metadata
    const contextPairs = Object.entries(meta)
      .filter(([k]) => !['level', 'category'].includes(k))
      .slice(0, 3) // Limit to 3 key-value pairs for readability
      .map(([k, v]) => {
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v).substring(0, 50);
        return `${k}: ${valStr}`;
      });
    return contextPairs.length > 0 ? `${msg} (${contextPairs.join(', ')})` : msg;
  }

  _formatDisplayTimestamp(date = new Date()) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    // → "April 8, 2026 at 2:30 PM"
  }

  _buildHumanMessage(action, details = {}) {
    const messages = {
      book_appointment: () => {
        const dateStr = details.date
          ? new Date(details.date).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
            })
          : 'unknown date';
        return `User booked appointment${details.appointmentId ? ` #${details.appointmentId}` : ''} on ${dateStr} at ${details.time || 'unknown time'}`;
      },
      cancel_appointment: () => `User cancelled appointment${details.appointmentId ? ` #${details.appointmentId}` : ''}`,
      delete_appointment: () => `User deleted appointment${details.appointmentId ? ` #${details.appointmentId}` : ''}`,
      view_all_appointments: () => `Admin viewed all appointments${details.resultCount != null ? ` (${details.resultCount} results)` : ''}`,
      update_appointment: () => `Admin updated appointment${details.appointmentId ? ` #${details.appointmentId}` : ''}`,
      data_processing_consent_granted: () => 'User granted data processing consent',
      health_data_consent_granted: () => `User granted health data consent${details.purpose ? ` for: ${details.purpose}` : ''}`,
      marketing_consent_granted: () => 'User granted marketing consent',
      marketing_consent_withdrawn: () => 'User withdrew marketing consent',
      consent_withdrawn: () => `User withdrew ${details.consentType || 'unknown'} consent`,
      data_access_requested: () => 'User requested GDPR data access (Article 15)',
      data_rectification_requested: () => 'User requested data rectification (Article 16)',
      data_erasure_requested: () => `User requested data erasure (Article 17)${details.reason ? ` — reason: ${details.reason}` : ''}`,
      data_portability_requested: () => 'User requested data portability (Article 20)',
      processing_objection_requested: () => 'User objected to data processing (Article 21)',
      processing_restriction_requested: () => 'User requested processing restriction (Article 18)',
      data_breach_affected: () => `User notified as affected by data breach${details.breachId ? ` #${details.breachId}` : ''}`,
      gdpr_data_export: () => 'User requested GDPR data export',
      gdpr_data_deletion: () => `User requested account deletion${details.reason ? ` (reason: ${details.reason})` : ''}`,
    };
    const builder = messages[action];
    return builder ? builder() : action.replace(/_/g, ' ');
  }

  _reqContext(req) {
    return {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      requestId: req.id,
    };
  }

  _getSecuritySeverity(eventType) {
    const critical = ['AUTH_FAILED_LOGIN', 'AUTH_ACCOUNT_LOCKED', 'DATA_BREACH'];
    const warnings = ['AUTH_MULTIPLE_FAILED', 'RATE_LIMIT_EXCEEDED'];
    if (critical.includes(eventType)) return 'critical';
    if (warnings.includes(eventType)) return 'high';
    return 'medium';
  }

  _isCriticalSecurityEvent(eventType) {
    return ['AUTH_FAILED_LOGIN', 'AUTH_ACCOUNT_LOCKED', 'DATA_BREACH'].includes(
      eventType
    );
  }

  async _asyncLogToDB(level, message, meta) {
    this._logToDB(level, message, meta).catch(err => {
      // Silent fail - don't crash app on log failure
      console.error('DB log failed:', err.message);
    });
  }

  async _logToDB(level, message, meta) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) return;

      const now = new Date();
      await Log.create({
        level,
        category: meta.category || 'general',
        message,
        action: meta.action || null,
        displayTimestamp: this._formatDisplayTimestamp(now),
        timestamp: now,
        userId: meta.userId || null,
        ip: meta.ip || null,
        userAgent: meta.userAgent || null,
        requestId: meta.requestId || null,
        metadata: meta,
      });
    } catch (dbErr) {
      // Fail silently
      console.error('DB log insert failed:', dbErr.message);
    }
  }


}

// Singleton export
const loggerInstance = new Logger();
module.exports = {
  logger: loggerInstance,
  logError: (msg, meta) => loggerInstance.error(msg, meta),
  logWarn: (msg, meta) => loggerInstance.warn(msg, meta),
  logInfo: (msg, meta) => loggerInstance.info(msg, meta),
  logUserAction: loggerInstance.logUserAction.bind(loggerInstance),
  logAdminAction: loggerInstance.logAdminAction.bind(loggerInstance),
  logSecurityEvent: loggerInstance.logSecurityEvent.bind(loggerInstance),
  Log, // Export model for direct use
};
