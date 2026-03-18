const helmet = require('helmet');
const crypto = require('crypto');

/**
 * Security configurations for the Express application
 */
const securityConfig = {
  // CSP Nonce Middleware
  nonceMiddleware: (req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  },

  // Helmet Configuration
  helmetOptions: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://unpkg.com",
          "https://js.stripe.com"
        ],
        scriptSrcAttr: [(req, res) => `'nonce-${res.locals.cspNonce}'`],
styleSrc: [
          "'self'",
          "'unsafe-hashes'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://cdn.jsdelivr.net",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "'sha256-biLFinpqYMtWHmXfkA1BPeCY0/fNt46SAZ+BBk5YUog='"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
        connectSrc: [
          "'self'",
          "https://api.mailjet.com",
          "https://cdn.jsdelivr.net",
          "https://api.stripe.com",
          "https://jefitnessja.com",
          "http://localhost:10000",
          "http://127.0.0.1:10000"
        ],
        frameSrc: ["'self'", "https://js.stripe.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://via.placeholder.com",
          "https://cdn.jsdelivr.net",
          "https://*.stripe.com"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
        blockAllMixedContent: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" }
  },

  // Global OPTIONS handler logic
  optionsHandler: (req, res, next) => {
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      const allowedOrigins = [
        'https://jefitnessja.com',
        process.env.FRONTEND_URL
      ].filter(Boolean);
      
      const isLocalhostOrigin = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
      
      if (isLocalhostOrigin || process.env.NODE_ENV !== 'production') {
        allowedOrigins.push(
          'http://127.0.0.1:10000', 
          'http://127.0.0.1:5500', 
          'http://localhost:10000', 
          'http://localhost:5500'
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
        res.sendStatus(204);
      } else {
        res.sendStatus(403);
      }
      return;
    }
    next();
  }
};

module.exports = securityConfig;
