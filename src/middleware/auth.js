// middleware/auth.js
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { logger } = require('../services/logger');
const WebhookEvent = require('../models/WebhookEvent');

const {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} = require('./errorHandler');

// SECURITY: Webhook replay protection using MongoDB
// Webhook events are persisted in the database with TTL for replay protection
// This works across multiple server instances and survives restarts

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
      logger.warn('Security event: outdated_token_rejected', { userId });
      throw new AuthenticationError('Token has been revoked. Please log in again.');
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
      return res.status(401).json({
        success: false,
        error: 'Your session has expired. Please log in again.',
      });
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

    logger.info('Security event: token_version_incremented', {
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
 * SECURITY: Admin role verification middleware
 * CRITICAL: Always verify role from database, NEVER trust JWT claims alone
 * JWT claims can be stale if role was changed after token issuance
 */
async function requireAdmin(req, res, next) {
  // auth middleware already fetched a fresh role from DB and set req.user.role
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.',
    });
  }
  next();
}

/**
 * SECURITY: Trainer role verification middleware
 * CRITICAL: Always verify role from database, NEVER trust JWT claims alone
 * JWT claims can be stale if role was changed after token issuance
 */
async function requireTrainer(req, res, next) {
  // auth middleware already fetched a fresh role from DB and set req.user.role
  if (req.user?.role !== 'trainer') {
    logger.warn('Security event: trainer_access_denied', {
      userId: req.user?.id,
      role: req.user?.role,
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied. Trainer privileges required.',
    });
  }
  next();
}

/**
 * SECURITY: Helper to check if webhook event has been processed (replay protection)
 * Uses MongoDB for persistence across server restarts and instances
 * @param {string} eventId - Stripe webhook event ID
 * @returns {Promise<boolean>} True if event was already processed
 */
async function isWebhookEventProcessed(eventId) {
  try {
    const existingEvent = await WebhookEvent.findOne({ eventId });
    return !!existingEvent;
  } catch (err) {
    // If database is down, log error and fall back to safe behavior
    // (reject the event to prevent potential duplicate processing)
    logger.error('Failed to check webhook event status', { error: err.message });
    return true; // Assume processed on error (safe failure)
  }
}

/**
 * SECURITY: Mark webhook event as processed
 * Uses MongoDB TTL index for automatic cleanup after 24 hours
 * This prevents memory leaks and works across multiple server instances
 * @param {string} eventId - Stripe webhook event ID
 * @param {string} eventType - Type of webhook event
 * @returns {Promise<void>}
 */
async function markWebhookEventProcessed(eventId, eventType = 'unknown') {
  try {
    const webhookEvent = new WebhookEvent({
      eventId,
      eventType,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    // Use ensureProcessed to handle race conditions safely
    await webhookEvent.ensureProcessed();
    logger.info('Webhook event marked as processed', { eventId });
  } catch (err) {
    // Log error but don't throw - webhook processing should continue
    logger.error('Failed to mark webhook event as processed', {
      eventId,
      error: err.message,
    });
  }
}

module.exports = {
  auth,
  requireAdmin,
  requireTrainer,
  incrementUserTokenVersion,
  getUserTokenVersion,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
};
