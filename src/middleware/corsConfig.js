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
    // SECURITY: Define allowed origins explicitly (exact match only)
    const allowedOrigins = [
      'https://jefitness.onrender.com', // Production
      process.env.FRONTEND_URL,
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [])
    ].filter(Boolean);
    
    // SECURITY: In development only, allow localhost origins
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://127.0.0.1:10000',
        'http://127.0.0.1:5501',
        'http://localhost:10000',
        'http://localhost:5501'
      );
    }

    // SECURITY: Reject null origins (indicates potential CSRF or privacy mode)
    // Allow only if explicitly needed for mobile apps
    if (origin === 'null') {
      console.warn(`Security event: cors_null_origin_rejected | IP: ${this?.req?.ip || 'unknown'}`);
      callback(new Error('Null origin not allowed'), false);
      return;
    }

    // SECURITY: Allow requests with no origin (same-origin, server-to-server, or mobile apps)
    // Log for monitoring purposes
    if (!origin) {
      // Same-origin requests or direct server access
      callback(null, true);
      return;
    }
    
    // SECURITY: Exact match only - no wildcard or substring matching
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // SECURITY: Log rejected origins for security monitoring
      console.warn(`Security event: cors_origin_rejected | Origin: ${origin} | IP: ${this?.req?.ip || 'unknown'}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, // SECURITY: Allow credentials (cookies, auth headers) for authenticated requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Requested-With'],
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
    'https://jefitness.onrender.com',
    process.env.FRONTEND_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [])
  ].filter(Boolean);
  
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://127.0.0.1:10000',
      'http://127.0.0.1:5501',
      'http://localhost:10000',
      'http://localhost:5501'
    );
  }

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
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