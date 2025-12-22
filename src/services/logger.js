// Logger service that integrates with the in-memory logging system
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

module.exports = {
  logger,
  logError,
  logAdminAction,
  logUserAction
};
