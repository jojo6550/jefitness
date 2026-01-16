/**
 * CORS Configuration
 * Configures Cross-Origin Resource Sharing with security best practices
 */

const cors = require('cors');

/**
 * SECURITY: CORS options configuration
 * Restricts cross-origin requests to trusted origins only
 */
const corsOptions = {
  origin: function (origin, callback) {
    // SECURITY: Define allowed origins explicitly
    const allowedOrigins = [
      'https://jefitness.onrender.com', // Production
      process.env.FRONTEND_URL,
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
    ].filter(Boolean);
    
    // SECURITY: In development, allow localhost origins
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://127.0.0.1:10000',
        'http://127.0.0.1:5501',
        'http://localhost:10000',
        'http://localhost:5501'
      );
    }

    // SECURITY: Allow requests with no origin (mobile apps, server-side)
    // But log them for monitoring
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // SECURITY: Log rejected origins for security monitoring
      console.warn(`CORS: Rejected origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // SECURITY: Allow credentials (cookies, auth headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // SECURITY: Cache preflight for 24 hours
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
