/**
 * Protected Route Middleware Wrapper
 * Provides consistent middleware application for protected routes
 * Handles test environment bypass cleanly
 */

const { auth } = require('./auth');
const {
  requireDataProcessingConsent,
  requireHealthDataConsent,
  checkDataRestriction,
} = require('./consent');
const { apiLimiter } = require('./rateLimiter');
const versioning = require('./versioning');

/**
 * Creates a standardized middleware chain for protected routes
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireAuth - Whether auth is required (default: true)
 * @param {boolean} options.requireDataProcessingConsent - Require data processing consent (default: true)
 * @param {boolean} options.requireHealthDataConsent - Require health data consent (default: false)
 * @param {boolean} options.applyRateLimiter - Apply rate limiting (default: true)
 * @param {boolean} options.applyVersioning - Apply API versioning (default: true)
 * @returns {Array} - Array of middleware functions
 */
function createProtectedRouteMiddleware(options = {}) {
  const {
    requireAuth = true,
    requireDataProcessingConsent: needDataConsent = true,
    requireHealthDataConsent: needHealthConsent = false,
    applyRateLimiter = true,
    applyVersioning = true,
  } = options;

  const middleware = [];

  // Add auth middleware if required
  if (requireAuth) {
    middleware.push(auth);
  }

  // Add data processing consent if required
  if (needDataConsent) {
    middleware.push(requireDataProcessingConsent);
  }

  // Add health data consent if required
  if (needHealthConsent) {
    middleware.push(requireHealthDataConsent);
  }

  // Always add data restriction check
  middleware.push(checkDataRestriction);

  // Add rate limiter (skip in test environment)
  if (applyRateLimiter && process.env.NODE_ENV !== 'test') {
    middleware.push(apiLimiter);
  }

  // Add versioning if required
  if (applyVersioning) {
    middleware.push(versioning);
  }

  return middleware;
}

/**
 * Pre-configured middleware chains for common route types
 */
const routeMiddleware = {
  // Standard protected route - requires auth and data processing consent
  standard: createProtectedRouteMiddleware({
    requireAuth: true,
    requireDataProcessingConsent: true,
    requireHealthDataConsent: false,
    applyRateLimiter: true,
    applyVersioning: true,
  }),

  // Health data route - requires additional health consent
  healthData: createProtectedRouteMiddleware({
    requireAuth: true,
    requireDataProcessingConsent: true,
    requireHealthDataConsent: true,
    applyRateLimiter: true,
    applyVersioning: true,
  }),

  // Admin route - standard with rate limiting
  admin: createProtectedRouteMiddleware({
    requireAuth: true,
    requireDataProcessingConsent: true,
    requireHealthDataConsent: false,
    applyRateLimiter: true,
    applyVersioning: true,
  }),

  // No consent required - for routes that don't need GDPR consent
  basic: createProtectedRouteMiddleware({
    requireAuth: true,
    requireDataProcessingConsent: false,
    requireHealthDataConsent: false,
    applyRateLimiter: true,
    applyVersioning: true,
  }),

  // Minimal - just auth, no rate limiting (for internal/privileged routes)
  minimal: createProtectedRouteMiddleware({
    requireAuth: true,
    requireDataProcessingConsent: true,
    requireHealthDataConsent: false,
    applyRateLimiter: false,
    applyVersioning: true,
  }),
};

/**
 * Helper to wrap route modules with consistent middleware
 * @param {Express.Router} router - Express router instance
 * @param {string} routeType - Type of route ('standard', 'healthData', 'admin', 'basic', 'minimal')
 * @param {Function} routeModule - Route module to wrap
 * @returns {Function} - Route module with middleware applied
 */
function applyRouteMiddleware(router, routeType, routeModule) {
  const middleware = routeMiddleware[routeType] || routeMiddleware.standard;
  return middleware.concat(routeModule);
}

module.exports = {
  createProtectedRouteMiddleware,
  routeMiddleware,
  applyRouteMiddleware,
};
