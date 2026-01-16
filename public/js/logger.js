/**
 * Secure Frontend Logger
 * 
 * This module provides a secure logging solution that:
 * - Suppresses all console output in production for security
 * - Optionally sends logs to the backend server for monitoring
 * - Prevents sensitive data leakage through browser console
 * 
 * Usage:
 *   logger.info('User logged in');
 *   logger.warn('Deprecated API usage');
 *   logger.error('Failed to load data');
 */

// Configuration
const LOG_LEVEL = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

// Get log level from environment (default to NONE in production)
const getLogLevel = () => {
  // In production, default to no logging
  if (window.location.hostname !== 'localhost' && 
      window.location.hostname !== '127.0.0.1' &&
      !window.location.hostname.includes('.local')) {
    return LOG_LEVEL.NONE;
  }
  
  // Allow debug override via localStorage
  const stored = localStorage.getItem('jefitness_log_level');
  if (stored && !isNaN(stored)) {
    return parseInt(stored, 10);
  }
  
  return LOG_LEVEL.NONE; // Default to silent
};

// Batch logs to send to server
const logQueue = [];
const BATCH_SIZE = 10;
const BATCH_INTERVAL = 30000; // 30 seconds

/**
 * Send batched logs to backend
 */
async function flushLogQueue() {
  if (logQueue.length === 0) return;
  
  const logsToSend = logQueue.splice(0, BATCH_SIZE);
  
  try {
    const API_BASE = window.ApiConfig?.getAPI_BASE?.() || 
                     (window.location.hostname === 'localhost' ? 'http://localhost:10000' : 'https://jefitness.onrender.com');
    
    await fetch(`${API_BASE}/api/logs/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: logsToSend })
    });
  } catch (e) {
    // Silently fail - don't expose logs
  }
}

// Flush logs periodically
if (typeof window !== 'undefined') {
  setInterval(flushLogQueue, BATCH_INTERVAL);
  
  // Flush on page unload
  window.addEventListener('beforeunload', flushLogQueue);
}

/**
 * Main logger object
 */
const logger = {
  /**
   * Log info messages
   * @param {string} message - Log message
   * @param {object} [meta={}] - Additional metadata
   */
  info: (message, meta = {}) => {
    const level = getLogLevel();
    if (level >= LOG_LEVEL.INFO) {
      const entry = {
        level: 'info',
        message: String(message),
        meta: sanitizeMeta(meta),
        timestamp: new Date().toISOString()
      };
      logQueue.push(entry);
      // In debug mode, also log to console
      if (level >= LOG_LEVEL.DEBUG) {
        console.log(`[INFO] ${message}`, meta);
      }
    }
  },

  /**
   * Log warning messages
   * @param {string} message - Log message
   * @param {object} [meta={}] - Additional metadata
   */
  warn: (message, meta = {}) => {
    const level = getLogLevel();
    if (level >= LOG_LEVEL.WARN) {
      const entry = {
        level: 'warn',
        message: String(message),
        meta: sanitizeMeta(meta),
        timestamp: new Date().toISOString()
      };
      logQueue.push(entry);
      if (level >= LOG_LEVEL.DEBUG) {
        console.warn(`[WARN] ${message}`, meta);
      }
    }
  },

  /**
   * Log error messages
   * @param {string} message - Log message
   * @param {object} [meta={}] - Additional metadata
   */
  error: (message, meta = {}) => {
    const level = getLogLevel();
    if (level >= LOG_LEVEL.ERROR) {
      const entry = {
        level: 'error',
        message: String(message),
        meta: sanitizeMeta(meta),
        timestamp: new Date().toISOString()
      };
      logQueue.push(entry);
      if (level >= LOG_LEVEL.DEBUG) {
        console.error(`[ERROR] ${message}`, meta);
      }
    }
  },

  /**
   * Log debug messages (only in development)
   * @param {string} message - Log message
   * @param {object} [meta={}] - Additional metadata
   */
  debug: (message, meta = {}) => {
    const level = getLogLevel();
    if (level >= LOG_LEVEL.DEBUG) {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  },

  /**
   * Enable debug mode for local development
   */
  enableDebug: () => {
    localStorage.setItem('jefitness_log_level', LOG_LEVEL.DEBUG);
    console.log('JEFitness logger: Debug mode enabled');
  },

  /**
   * Disable all logging
   */
  disable: () => {
    localStorage.setItem('jefitness_log_level', LOG_LEVEL.NONE);
  },

  /**
   * Get current log level
   */
  getLevel: () => {
    return getLogLevel();
  }
};

/**
 * Sanitize metadata to prevent sensitive data leakage
 * @param {object} meta - Metadata to sanitize
 * @returns {object} Sanitized metadata
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  const sanitized = {};
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'auth', 'credential',
    'card', 'cvv', 'ssn', 'creditCard'
  ];

  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive patterns
    const isSensitive = sensitiveKeys.some(sensitive => 
      lowerKey.includes(sensitive)
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 100) {
      // Truncate long strings
      sanitized[key] = value.substring(0, 100) + '...';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeMeta(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Export to window for global access
if (typeof window !== 'undefined') {
  window.logger = logger;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = logger;
}

