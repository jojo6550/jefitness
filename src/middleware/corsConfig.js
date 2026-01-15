/**
 * CORS Configuration
 * Configures Cross-Origin Resource Sharing with security best practices
 */

const cors = require('cors');

/**
 * CORS options configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://jefitness.onrender.com', // Same-origin for production
      'http://127.0.0.1:1000',
      'http://127.0.0.1:5501',
      'http://localhost:10000',
      process.env.FRONTEND_URL,
      process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim())
    ].filter(Boolean).flat();

    // Allow requests with no origin (mobile apps, curl requests, server-side requests)
    // Allow same-origin requests (origin matches the host)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Do not throw error - return false to deny
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // 24 hours
  preflightContinue: true
};

/**
 * CORS preflight handler
 * Explicitly handles OPTIONS requests
 */
const corsPreflightHandler = (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
};

module.exports = {
  corsOptions,
  corsPreflightHandler
};
