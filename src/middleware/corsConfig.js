/**
 * CORS Configuration
 * Configures Cross-Origin Resource Sharing with security best practices
 */

const cors = require('cors');
const { logger } = require('../services/logger');

/**
 * SECURITY: CORS options configuration
 * Restricts cross-origin requests to trusted origins only
 * IMPORTANT: Never use wildcard (*) origins in production
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Hardcoded allowed origins ONLY - localhost:10000 and jefitnessja.com
    const allowedOrigins = [
      'https://jefitnessja.com',
      'https://www.jefitnessja.com',
      'http://localhost:10000',
      'http://127.0.0.1:10000',
    ];

    // SECURITY: Allow requests with no origin (same-origin, server-to-server, or mobile apps)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('Security event: cors_origin_rejected', { origin });
      callback(new Error(`Not allowed by CORS: ${origin}`), false);
    }
  },
  credentials: true, // SECURITY: Allow credentials (cookies, auth headers) for authenticated requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Auth-Token',
    'X-Requested-With',
    'X-CSRF-Token',
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',
  ],
  maxAge: 86400, // SECURITY: Cache preflight for 24 hours to reduce overhead
  preflightContinue: false, // SECURITY: Don't pass preflight to route handlers
  optionsSuccessStatus: 204, // SECURITY: Use 204 for OPTIONS instead of 200
};

/**
 * SECURITY: CORS preflight handler
 * Explicitly handles OPTIONS requests with security headers
 */
module.exports = {
  corsOptions,
};
