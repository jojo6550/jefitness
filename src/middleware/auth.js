// middleware/auth.js
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { logger, logSecurityEvent } = require('../services/logger');

const { AuthenticationError } = require('./errorHandler');

/**
 * SECURITY: Main authentication middleware
 * Validates JWT token and ensures it hasn't been revoked via token versioning
 */
async function auth(req, res, next) {
  const authHeader = req.header('Authorization');
  let token;

  // Prefer httpOnly cookie — falls back to Authorization header for API clients
  if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '').trim();
  } else {
    token = req.header('x-auth-token');
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided. Please log in.',
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: { message: 'Server configuration error: JWT secret missing.' },
      });
    }

    // SECURITY: Verify JWT signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // SECURITY: Validate token structure
    if (!decoded.id && !decoded.userId) {
      throw new AuthenticationError('Invalid session. Please log in again.');
    }

    const userId = decoded.userId || decoded.id;
    const tokenVersion = decoded.tokenVersion || 0;

    // SECURITY: Fetch user once — includes all fields needed by downstream middleware
    // (consent, role checks, data restriction) so they don't need to re-query
    const user = await User.findById(userId, '+tokenVersion').lean();

    if (!user) {
      throw new AuthenticationError('Account not found. Please sign up or log in again.');
    }

    const currentVersion = user.tokenVersion || 0;

    // SECURITY: Reject tokens with outdated version
    if (tokenVersion < currentVersion) {
      logSecurityEvent('OUTDATED_TOKEN_REJECTED', userId, { tokenVersion, currentVersion }, req).catch(() => {});
      return res.status(401).json({
        success: false,
        error: 'Invalid session. Please log in again.',
      });
    }

    req.user = decoded;
    // Normalize user ID for consistency across routes
    req.user.id = userId;
    req.user._id = userId; // alias so code using req.user._id works (JWT payload uses 'id', not '_id')
    req.user.role = user.role; // SECURITY: Always use fresh role from DB
    // Attach full user doc so downstream middleware (consent, role checks) can
    // read from it without issuing additional DB queries
    req.userDoc = user;
    next();
  } catch (err) {
    // SECURITY: Don't leak error details about JWT internals
    if (err.name === 'TokenExpiredError') {
      logSecurityEvent('JWT_EXPIRED', null, { ip: req.ip }, req).catch(() => {});
      return res.status(401).json({
        success: false,
        error: 'Your session has expired. Please log in again.',
      });
    }
    // AuthenticationError was already logged at throw site; avoid double-logging
    if (!(err instanceof AuthenticationError)) {
      logSecurityEvent('JWT_INVALID', null, { ip: req.ip, error: err.message }, req).catch(() => {});
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid session. Please log in again.',
    });
  }
}

/**
 * SECURITY: Increment token version in database (invalidates all existing tokens)
 * This is restart-safe and works across multiple server instances
 * Call this after password change or security events requiring full logout
 */
async function incrementUserTokenVersion(userId) {
  try {
    const user = await User.findById(userId).select('+tokenVersion');
    if (!user) {
      logger.error('Failed to increment token version: user not found', { userId });
      return;
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    logger.info('TOKEN_VERSION_INCREMENTED', {
      userId,
      newVersion: user.tokenVersion,
    });
  } catch (err) {
    logger.error('Failed to increment token version', { userId, error: err.message });
  }
}

/**
 * SECURITY: Get current token version for a user from database
 */
async function getUserTokenVersion(userId) {
  try {
    const user = await User.findById(userId).select('+tokenVersion');
    return user ? user.tokenVersion || 0 : 0;
  } catch (err) {
    logger.error('Failed to get token version', { userId, error: err.message });
    return 0;
  }
}

/**
 * SECURITY: Role verification middleware factory
 * CRITICAL: Always verify role from database, NEVER trust JWT claims alone
 * JWT claims can be stale if role was changed after token issuance
 */
const requireRole = (role, onDeny) => (req, res, next) => {
  if (req.user?.role !== role) {
    if (onDeny) onDeny(req);
    return res.status(403).json({
      success: false,
      error: `Access denied. ${role.charAt(0).toUpperCase() + role.slice(1)} privileges required.`,
    });
  }
  next();
};

const requireAdmin = requireRole('admin');
const requireTrainer = requireRole('trainer', req =>
  logSecurityEvent('UNAUTHORIZED_ROLE_ACCESS', req.user?.id, {
    role: req.user?.role,
    required: 'trainer',
  }, req).catch(() => {})
);

module.exports = {
  auth,
  requireAdmin,
  requireTrainer,
  incrementUserTokenVersion,
  getUserTokenVersion,
};
