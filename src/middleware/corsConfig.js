/**
 * CORS Configuration
 * Configures Cross-Origin Resource Sharing with security best practices
 */

const cors = require('cors');

/**
 * SECURITY: CORS options configuration
 * Restricts cross-origin requests to trusted origins only
 * IMPORTANT: Never use wildcard (*) origins in production
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Define allowed origins explicitly (exact match only)
    const allowedOrigins = [
      'https://jefitness.onrender.com', // Production backend
      'https://jefitnessja.com',        // Custom frontend domain
      process.env.FRONTEND_URL,
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [])
    ].filter(Boolean);
    
    // Always allow localhost origins for development
    // Check if origin contains localhost or 127.0.0.1
    const isLocalhostOrigin = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
    
    if (isLocalhostOrigin || process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://127.0.0.1:10000',
        'http://127.0.0.1:5500',
        'http://localhost:10000',
        'http://localhost:5500',
        'http://localhost:5501',
        'https://jefitness.onrender.com'
      );
    }

    // SECURITY: Allow requests with no origin (same-origin, server-to-server, or mobile apps)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Security event: cors_origin_rejected | Origin: ${origin}`);
      callback(new Error(`Not allowed by CORS: ${origin}`), false);
    }
  },
  credentials: true, // SECURITY: Allow credentials (cookies, auth headers) for authenticated requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // SECURITY: Cache preflight for 24 hours to reduce overhead
  preflightContinue: false, // SECURITY: Don't pass preflight to route handlers
  optionsSuccessStatus: 204 // SECURITY: Use 204 for OPTIONS instead of 200
};

/**
 * SECURITY: CORS preflight handler
 * Explicitly handles OPTIONS requests with security headers
 */
const corsPreflightHandler = (req, res) => {
  const origin = req.headers.origin;
  
  // SECURITY: Only set Access-Control-Allow-Origin for allowed origins
  const allowedOrigins = [
    'https://jefitness.onrender.com', // Production backend
    'https://jefitnessja.com',        // Custom frontend domain
    process.env.FRONTEND_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [])
  ].filter(Boolean);
  
  // Always allow localhost origins for development
  const isLocalhostOrigin = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
  
  if (isLocalhostOrigin || process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://127.0.0.1:10000',
      'http://127.0.0.1:5500',
      'http://localhost:10000',
      'http://localhost:5500',
      'https://jefitness.onrender.com'
    );
  }

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Requested-With, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
  } else if (!origin) {
    // Allow requests with no origin (same-origin requests)
    res.sendStatus(204);
  } else {
    console.warn(`Security event: cors_preflight_rejected | Origin: ${origin}`);
    res.sendStatus(403);
  }
};

module.exports = {
  corsOptions,
  corsPreflightHandler
};
