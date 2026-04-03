const crypto = require('crypto');

const helmet = require('helmet');

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
          "'unsafe-inline'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://js.stripe.com',
          'https://checkout.stripe.com',
        ],
        scriptSrcAttr: [(req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: [
          "'self'",
          "'unsafe-hashes'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          "'sha256-biLFinpqYMtWHmXfkA1BPeCY0/fNt46SAZ+BBk5YUog='",
          "'sha256-AUY0m1X9Sfh14gTAfA1FDbB5e6FpSDBkqMaQDOZyhE8='",
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        connectSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://api.stripe.com',
          'https://jefitnessja.com',
          'http://localhost:10000',
          'http://127.0.0.1:10000',
        ],
        frameSrc: ["'self'", 'https://js.stripe.com', 'https://checkout.stripe.com', 'https://hooks.stripe.com'],
        imgSrc: [
          "'self'",
          'data:',
          'https://via.placeholder.com',
          'https://cdn.jsdelivr.net',
          'https://*.stripe.com',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  },
};

module.exports = securityConfig;
