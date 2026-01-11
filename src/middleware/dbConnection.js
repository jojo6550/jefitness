/**
 * Database Connection Status Middleware
 * Checks if MongoDB is connected before allowing database operations
 */

const mongoose = require('mongoose');

/**
 * Middleware to check if database is connected
 * Use this for routes that require database access
 */
const requireDbConnection = (req, res, next) => {
  const connectionState = mongoose.connection.readyState;
  
  // Connection states:
  // 0 = disconnected
  // 1 = connected
  // 2 = connecting
  // 3 = disconnecting
  
  if (connectionState === 1) {
    // Database is connected, proceed
    next();
  } else if (connectionState === 2 || connectionState === 3) {
    // Database is connecting or disconnecting
    console.warn(`[DB] Database ${connectionState === 2 ? 'connecting' : 'disconnecting'}, request queued or rejected`);
    
    // For login/signup, we should reject - can't authenticate without DB
    if (req.path.includes('login') || req.path.includes('signup')) {
      return res.status(503).json({
        msg: 'Service temporarily unavailable. Database connection in progress.',
        retryAfter: 10
      });
    }
    
    // For other requests, wait briefly then check again
    setTimeout(() => {
      if (mongoose.connection.readyState === 1) {
        next();
      } else {
        return res.status(503).json({
          msg: 'Service temporarily unavailable. Please retry.',
          retryAfter: 10
        });
      }
    }, 1000);
  } else {
    // Database is disconnected
    console.error('[DB] Database not connected, request rejected');
    
    return res.status(503).json({
      msg: 'Service temporarily unavailable. Database disconnected.',
      retryAfter: 30
    });
  }
};

/**
 * Utility function to check if database is connected
 * Can be used in route handlers
 */
const isDbConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Utility function to get database connection status string
 */
const getDbStatus = () => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
};

module.exports = {
  requireDbConnection,
  isDbConnected,
  getDbStatus
};

