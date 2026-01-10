// Logger service that integrates with the in-memory logging system
const Log = require('../models/Log');
const { Client } = require('node-mailjet');

const logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${message}`, meta);
  },
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${message}`, meta);
  }
};

// Function to log errors
function logError(error, context = {}) {
  logger.error(`Error occurred: ${error.message}`, {
    stack: error.stack,
    ...context
  });
}

// Function to log admin actions
function logAdminAction(action, adminId, details = {}) {
  logger.info(`Admin action: ${action}`, {
    adminId,
    details,
    timestamp: new Date().toISOString()
  });
}

// Function to log user actions
function logUserAction(action, userId, details = {}) {
  logger.info(`User action: ${action}`, {
    userId,
    details,
    timestamp: new Date().toISOString()
  });
}

// Enhanced security logging functions
async function logSecurityEvent(eventType, userId, details = {}, req = null) {
  // Skip database logging if connection issues detected
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    // Database not connected, just log to console
    logger.warn(`[SECURITY] ${eventType}: DB not connected, skipping DB log`, { userId, details });
    return;
  }

  try {
    const logEntry = {
      level: getSecurityEventLevel(eventType),
      category: 'security',
      message: `${eventType}: ${details.message || 'Security event occurred'}`,
      userId,
      metadata: {
        eventType,
        ...details,
        timestamp: new Date().toISOString()
      }
    };

    if (req) {
      logEntry.ip = req.ip || req.connection.remoteAddress;
      logEntry.userAgent = req.get('User-Agent');
      logEntry.requestId = req.id || Math.random().toString(36).substr(2, 9);
      logEntry.metadata.path = req.path;
      logEntry.metadata.method = req.method;
    }

    // Save to database - wrapped in try-catch to prevent crashes
    try {
      await Log.create(logEntry);
    } catch (dbError) {
      // Don't let DB errors propagate - just log to console
      logger.error(`[DB ERROR] Failed to save security log: ${dbError.message}`, {
        eventType,
        userId,
        metadata: logEntry.metadata
      });
    }

    // Log to console
    logger.info(`Security Event: ${eventType}`, logEntry.metadata);

    // Send alerts for critical events - don't let this crash
    if (isCriticalSecurityEvent(eventType)) {
      try {
        await sendSecurityAlert(logEntry);
      } catch (alertError) {
        logger.error(`Failed to send security alert: ${alertError.message}`);
      }
    }

  } catch (error) {
    // Catch-all for any other errors in this function
    logger.error('Failed to log security event:', { error: error.message, eventType, userId });
    // Don't re-throw - we don't want logging failures to crash the app
  }
}

// Function to log data access events
async function logDataAccess(userId, action, resource, details = {}, req = null) {
  await logSecurityEvent('DATA_ACCESS', userId, {
    action,
    resource,
    ...details
  }, req);
}

// Function to log authentication events
async function logAuthEvent(eventType, userId, details = {}, req = null) {
  await logSecurityEvent(`AUTH_${eventType}`, userId, details, req);
}

// Function to log API key events
async function logAPIKeyEvent(eventType, userId, keyId, details = {}, req = null) {
  await logSecurityEvent(`API_KEY_${eventType}`, userId, {
    keyId,
    ...details
  }, req);
}

// Helper function to determine log level for security events
function getSecurityEventLevel(eventType) {
  const criticalEvents = ['AUTH_FAILED_LOGIN', 'AUTH_ACCOUNT_LOCKED', 'DATA_ACCESS_DENIED', 'API_KEY_EXPIRED'];
  const warningEvents = ['AUTH_MULTIPLE_FAILED', 'API_KEY_ROTATED'];

  if (criticalEvents.includes(eventType)) return 'error';
  if (warningEvents.includes(eventType)) return 'warn';
  return 'info';
}

// Helper function to check if event requires immediate alert
function isCriticalSecurityEvent(eventType) {
  return ['AUTH_FAILED_LOGIN', 'AUTH_ACCOUNT_LOCKED', 'DATA_ACCESS_DENIED', 'API_KEY_EXPIRED'].includes(eventType);
}

// Function to send security alerts via email
async function sendSecurityAlert(logEntry) {
  try {
    if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
      logger.warn('Mailjet credentials not configured, skipping security alert email');
      return;
    }

    const mailjet = new Client({
      apiKey: process.env.MAILJET_API_KEY,
      apiSecret: process.env.MAILJET_SECRET_KEY
    });

    const alertData = {
      Messages: [
        {
          From: {
            Email: process.env.ALERT_FROM_EMAIL || 'alerts@jefitness.com',
            Name: 'JE Fitness Security Alert'
          },
          To: [
            {
              Email: process.env.ALERT_TO_EMAIL || 'admin@jefitness.com',
              Name: 'Admin'
            }
          ],
          Subject: `Security Alert: ${logEntry.metadata.eventType}`,
          TextPart: `
Security Alert Details:
- Event: ${logEntry.metadata.eventType}
- User ID: ${logEntry.userId || 'N/A'}
- Time: ${logEntry.metadata.timestamp}
- Message: ${logEntry.message}
- IP: ${logEntry.ip || 'N/A'}
- Details: ${JSON.stringify(logEntry.metadata, null, 2)}
          `,
          HTMLPart: `
<h2>Security Alert</h2>
<p><strong>Event:</strong> ${logEntry.metadata.eventType}</p>
<p><strong>User ID:</strong> ${logEntry.userId || 'N/A'}</p>
<p><strong>Time:</strong> ${logEntry.metadata.timestamp}</p>
<p><strong>Message:</strong> ${logEntry.message}</p>
<p><strong>IP Address:</strong> ${logEntry.ip || 'N/A'}</p>
<h3>Details:</h3>
<pre>${JSON.stringify(logEntry.metadata, null, 2)}</pre>
          `
        }
      ]
    };

    const result = await mailjet.post('send', { version: 'v3.1' }).request(alertData);
    logger.info('Security alert email sent successfully', { messageId: result.body.Messages[0].To[0]['MessageID'] });

  } catch (error) {
    logger.error('Failed to send security alert email:', { error: error.message });
  }
}

module.exports = {
  logger,
  logError,
  logAdminAction,
  logUserAction,
  logSecurityEvent,
  logDataAccess,
  logAuthEvent,
  logAPIKeyEvent,
  sendSecurityAlert
};
