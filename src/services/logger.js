const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
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
        level: 'error'
      }),
      // Combined logs
      new DailyRotateFile({
        filename: path.join(logDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d'
      })
    ];

    // Console transport (dev pretty, prod JSON — visible in Render dashboard logs)
    if (process.env.NODE_ENV !== 'production') {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    } else {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.service },
      transports
    });
  }

  info(msg, meta = {}) { 
    const fullMeta = { level: 'info', ...meta };
    this.logger.info(msg, fullMeta);
    this._logToDBIfAudit('info', msg, fullMeta);
  }

  warn(msg, meta = {}) { 
    const fullMeta = { level: 'warn', ...meta };
    this.logger.warn(msg, fullMeta);
    this._logToDBIfAudit('warn', msg, fullMeta);
  }

  error(msg, meta = {}) { 
    const fullMeta = { level: 'error', ...meta };
    this.logger.error(msg, fullMeta);
    this._asyncLogToDB('error', msg, fullMeta);
  }

  debug(msg, meta = {}) { 
    const fullMeta = { level: 'debug', ...meta };
    this.logger.debug(msg, fullMeta);
  }

  http(msg, meta = {}) { 
    const fullMeta = { level: 'http', ...meta };
    this.logger.http(msg, fullMeta);
  }

  // Convenience methods
  logUserAction(action, userId, details = {}, req = null) {
    this.info(`User action: ${action}`, {
      category: 'user',
      userId,
      action,
      details,
      ...(req ? this._reqContext(req) : {})
    });
  }

  logAdminAction(action, adminId, details = {}) {
    this.info(`Admin action: ${action}`, {
      category: 'admin',
      userId: adminId,
      action,
      details
    });
  }

  async logSecurityEvent(eventType, userId, details = {}, req = null) {
    const securityMeta = {
      category: 'security',
      eventType,
      userId,
      severity: this._getSecuritySeverity(eventType),
      ...details,
      ...(req ? this._reqContext(req) : {})
    };

    this.warn(`Security Event: ${eventType}`, securityMeta);
    await this._logToDB('warn', `Security: ${eventType}`, securityMeta);

    if (this._isCriticalSecurityEvent(eventType)) {
      // Trigger alerts
      this.error('CRITICAL SECURITY EVENT', securityMeta);
    }
  }

  // Private helpers
  _reqContext(req) {
    return {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      requestId: req.id
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
    return ['AUTH_FAILED_LOGIN', 'AUTH_ACCOUNT_LOCKED', 'DATA_BREACH'].includes(eventType);
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

      // Audit-worthy: security/user/admin + errors
      if (['security', 'user', 'admin'].includes(meta.category) || level === 'error') {
        await Log.create({
          level,
          category: meta.category || 'general',
          message,
          userId: meta.userId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
          metadata: meta
        });
      }
    } catch (dbErr) {
      // Fail silently
    }
  }

  _logToDBIfAudit(level, message, meta) {
    if (['security', 'user', 'admin'].includes(meta?.category)) {
      this._asyncLogToDB(level, message, meta);
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
  Log // Export model for direct use
};

