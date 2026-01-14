const winston = require('winston');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Monitoring service for production error tracking, performance monitoring, and alerting
 * Integrates with external monitoring services like Sentry, DataDog, etc.
 */
class MonitoringService {
  constructor() {
    this.logger = this.setupLogger();
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      systemLoad: os.loadavg()
    };

    // Initialize monitoring intervals
    this.startMonitoring();
  }

  /**
   * Set up Winston logger with multiple transports
   */
  setupLogger() {
    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'je-fitness' },
      transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
    });

    // If we're not in production then log to the `console` with a simple format
    if (process.env.NODE_ENV !== 'production') {
      logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    return logger;
  }

  /**
   * Initialize Sentry for error tracking (if configured)
   */
  setupSentry() {
    if (process.env.SENTRY_DSN) {
      const Sentry = require('@sentry/node');
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');

      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Console(),
          nodeProfilingIntegration(),
        ],
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
      });

      this.logger.info('Sentry error monitoring initialized');
    }
  }

  /**
   * Start periodic monitoring tasks
   */
  startMonitoring() {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Log performance summary every 5 minutes
    setInterval(() => {
      this.logPerformanceSummary();
    }, 300000);

    // Check for alerts every minute
    setInterval(() => {
      this.checkAlerts();
    }, 60000);
  }

  /**
   * Update system performance metrics
   */
  updateSystemMetrics() {
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.systemLoad = os.loadavg();
    this.metrics.uptime = process.uptime();
  }

  /**
   * Record an incoming request
   */
  recordRequest(method, path, responseTime, statusCode) {
    this.metrics.requests++;
    this.metrics.responseTimes.push(responseTime);

    // Keep only last 1000 response times for memory efficiency
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }

    // Log slow requests
    if (responseTime > 1000) {
      this.logger.warn('Slow request detected', {
        method,
        path,
        responseTime,
        statusCode
      });
    }
  }

  /**
   * Record an error
   */
  recordError(error, context = {}) {
    this.metrics.errors++;

    this.logger.error('Application error', {
      error: error.message,
      stack: error.stack,
      ...context
    });

    // Send to Sentry if configured
    if (global.Sentry) {
      global.Sentry.captureException(error, {
        tags: context
      });
    }
  }

  /**
   * Record security event
   */
  recordSecurityEvent(event, details = {}) {
    this.logger.warn('Security event', {
      event,
      ...details,
      severity: this.getSecuritySeverity(event)
    });

    // Send critical security events to alerting system
    if (this.getSecuritySeverity(event) === 'critical') {
      this.sendAlert('CRITICAL_SECURITY_EVENT', {
        event,
        details,
        timestamp: new Date().toISOString()
      });
    }

    // GDPR/HIPAA Data Breach Detection
    if (this.isPotentialDataBreach(event)) {
      this.handleDataBreach(event, details);
    }
  }

  /**
   * Check if event indicates potential data breach
   */
  isPotentialDataBreach(event) {
    const breachEvents = [
      'unauthorized_access',
      'data_breach',
      'mass_data_export',
      'suspicious_activity',
      'encryption_key_compromised',
      'bulk_data_deletion'
    ];
    return breachEvents.includes(event);
  }

  /**
   * Handle potential data breach according to GDPR/HIPAA requirements
   */
  async handleDataBreach(event, details) {
    const breachId = `BREACH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.error('POTENTIAL DATA BREACH DETECTED', {
      breachId,
      event,
      details,
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL'
    });

    // Immediate containment actions
    this.containDataBreach(event, details);

    // Notify relevant parties
    await this.notifyDataBreach(breachId, event, details);

    // Log breach in compliance system
    await this.logDataBreach(breachId, event, details);
  }

  /**
   * Contain the data breach
   */
  containDataBreach(event, details) {
    // Implement immediate containment measures
    switch (event) {
      case 'unauthorized_access':
        // Lock affected accounts, revoke tokens
        this.logger.warn('Implementing containment: Account lockdowns initiated');
        break;
      case 'data_breach':
        // Encrypt affected data, isolate systems
        this.logger.warn('Implementing containment: Data isolation initiated');
        break;
      case 'encryption_key_compromised':
        // Rotate encryption keys, re-encrypt data
        this.logger.warn('Implementing containment: Key rotation initiated');
        break;
      default:
        this.logger.warn('Implementing containment: General security measures activated');
    }
  }

  /**
   * Notify relevant parties of data breach
   */
  async notifyDataBreach(breachId, event, details) {
    const breachNotification = {
      breachId,
      event,
      details,
      timestamp: new Date().toISOString(),
      affectedData: this.identifyAffectedData(event, details),
      riskAssessment: this.assessBreachRisk(event, details)
    };

    // Send to compliance team
    if (process.env.COMPLIANCE_WEBHOOK_URL) {
      try {
        const response = await fetch(process.env.COMPLIANCE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'data_breach_alert',
            ...breachNotification
          })
        });
        this.logger.info('Data breach notification sent to compliance team');
      } catch (error) {
        this.logger.error('Failed to send breach notification to compliance team', { error: error.message });
      }
    }

    // Send to supervisory authority if required (within 72 hours for GDPR)
    if (this.requiresSupervisoryNotification(event, details)) {
      this.logger.warn('BREACH REQUIRES SUPERVISORY AUTHORITY NOTIFICATION', { breachId });
      // Implement supervisory authority notification logic
    }

    // Notify affected data subjects if high risk
    if (breachNotification.riskAssessment === 'high') {
      this.logger.warn('HIGH RISK BREACH - DATA SUBJECT NOTIFICATION REQUIRED', { breachId });
      // Implement data subject notification logic
    }
  }

  /**
   * Log breach in compliance system
   */
  async logDataBreach(breachId, event, details) {
    try {
      const complianceService = require('./compliance');
      await complianceService.logDataBreach(breachId, event, details);
    } catch (error) {
      this.logger.error('Failed to log breach in compliance system', { error: error.message });
    }
  }

  /**
   * Identify what data may be affected
   */
  identifyAffectedData(event, details) {
    const affectedData = [];

    if (details.userId) affectedData.push('personal_data');
    if (details.healthData) affectedData.push('health_data');
    if (details.medicalRecords) affectedData.push('medical_records');
    if (details.paymentInfo) affectedData.push('payment_information');

    // Add more data type identification logic based on event
    switch (event) {
      case 'unauthorized_access':
        affectedData.push('account_data');
        break;
      case 'data_breach':
        affectedData.push('bulk_data');
        break;
    }

    return [...new Set(affectedData)]; // Remove duplicates
  }

  /**
   * Assess risk level of breach
   */
  assessBreachRisk(event, details) {
    // High risk if health data or large number of individuals affected
    if (details.healthData || details.medicalRecords ||
        (details.affectedUsers && details.affectedUsers > 100)) {
      return 'high';
    }

    // Medium risk for other sensitive data
    if (details.personalData || details.paymentInfo) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Check if breach requires notification to supervisory authority
   */
  requiresSupervisoryNotification(event, details) {
    // GDPR requires notification within 72 hours if high risk to individuals
    return this.assessBreachRisk(event, details) === 'high';
  }

  /**
   * Get security severity level
   */
  getSecuritySeverity(event) {
    const criticalEvents = [
      'brute_force_attempt',
      'data_breach',
      'unauthorized_access',
      'sql_injection_attempt'
    ];

    const highEvents = [
      'failed_login',
      'suspicious_activity',
      'rate_limit_exceeded'
    ];

    if (criticalEvents.includes(event)) return 'critical';
    if (highEvents.includes(event)) return 'high';
    return 'medium';
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary() {
    const avgResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;

    const memoryUsageMB = Math.round(this.metrics.memoryUsage.heapUsed / 1024 / 1024);

    this.logger.info('Performance summary', {
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      avgResponseTime: Math.round(avgResponseTime),
      memoryUsageMB,
      systemLoad: this.metrics.systemLoad,
      uptime: Math.round(this.metrics.uptime / 3600) + ' hours'
    });
  }

  /**
   * Check for alert conditions
   */
  checkAlerts() {
    const errorRate = this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0;

    // Alert on high error rate
    if (errorRate > 5) {
      this.sendAlert('HIGH_ERROR_RATE', {
        errorRate: errorRate.toFixed(2) + '%',
        totalRequests: this.metrics.requests,
        totalErrors: this.metrics.errors
      });
    }

    // Alert on high memory usage and trigger cleanup
    const currentMemoryUsage = process.memoryUsage();
    const memoryUsagePercent = (currentMemoryUsage.heapUsed / currentMemoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > 90) {
      this.sendAlert('HIGH_MEMORY_USAGE', {
        memoryUsagePercent: memoryUsagePercent.toFixed(2) + '%',
        heapUsed: Math.round(currentMemoryUsage.heapUsed / 1024 / 1024) + ' MB'
      });

      // Trigger memory cleanup when usage is critical
      this.performMemoryCleanup();
    }

    // Alert on high system load
    if (this.metrics.systemLoad[0] > os.cpus().length) {
      this.sendAlert('HIGH_SYSTEM_LOAD', {
        loadAverage: this.metrics.systemLoad[0].toFixed(2),
        cpuCount: os.cpus().length
      });
    }
  }

  /**
   * Perform memory cleanup operations
   */
  performMemoryCleanup() {
    this.logger.warn('Initiating memory cleanup due to high usage');

    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        this.logger.info('Garbage collection triggered');
      }

      // Clear old response times (keep only last 500)
      if (this.metrics.responseTimes.length > 500) {
        this.metrics.responseTimes = this.metrics.responseTimes.slice(-500);
        this.logger.info('Response times array trimmed to 500 entries');
      }

      // Reset metrics counters periodically to prevent unbounded growth
      if (this.metrics.requests > 100000) {
        this.metrics.requests = Math.floor(this.metrics.requests / 2);
        this.metrics.errors = Math.floor(this.metrics.errors / 2);
        this.logger.info('Metrics counters halved to prevent memory growth');
      }

      // Update memory usage after cleanup
      this.updateSystemMetrics();
      const newMemoryUsagePercent = (this.metrics.memoryUsage.heapUsed / this.metrics.memoryUsage.heapTotal) * 100;
      this.logger.info(`Memory cleanup completed. New usage: ${newMemoryUsagePercent.toFixed(2)}%`);

    } catch (error) {
      this.logger.error('Error during memory cleanup', { error: error.message });
    }
  }

  /**
   * Send alert to external monitoring service
   */
  sendAlert(alertType, data) {
    this.logger.error('ALERT TRIGGERED', {
      alertType,
      ...data
    });

    // In production, this would integrate with:
    // - PagerDuty for on-call alerts
    // - Slack/Teams for team notifications
    // - Email alerts for management
    // - SMS alerts for critical issues

    // Example: Send to webhook
    if (process.env.ALERT_WEBHOOK_URL) {
      fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType,
          ...data,
          service: 'je-fitness',
          environment: process.env.NODE_ENV || 'development'
        })
      }).catch(err => {
        this.logger.error('Failed to send alert webhook', { error: err.message });
      });
    }
  }

  /**
   * Health check endpoint data
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime,
      memory: this.metrics.memoryUsage,
      load: this.metrics.systemLoad,
      requests: this.metrics.requests,
      errors: this.metrics.errors
    };
  }

  /**
   * Get monitoring metrics for dashboard
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageResponseTime: this.metrics.responseTimes.length > 0
        ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
        : 0,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0
    };
  }
}

// Export singleton instance
module.exports = new MonitoringService();
