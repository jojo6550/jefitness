const crypto = require('crypto');

/**
 * Parse allowed origins from APP_URL env var (comma-separated).
 * Used for CSP directives that need to reference trusted origins.
 */
function getAppOrigins() {
  return (process.env.APP_URL || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);
}

/**
 * Get the primary public URL for use in links (emails, Stripe redirects).
 * Prefers first https non-localhost entry; falls back to production domain.
 */
function getPrimaryAppUrl() {
  const origins = getAppOrigins();
  return (
    origins.find(u => u.startsWith('https://') && !u.includes('localhost')) ||
    'https://jefitnessja.com'
  );
}

/**
 * Security configurations for the Express application
 */
const securityConfig = {
  // CSP Nonce Middleware
  nonceMiddleware: (_req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  },

  // Helmet Configuration
  helmetOptions: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://via.placeholder.com',
          'https://cdn.jsdelivr.net',
          'https://www.paypalobjects.com',
          'https://*.paypal.com',
          ...getAppOrigins(),
        ],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://www.paypal.com',
          'https://www.paypalobjects.com',
          'https://static.cloudflareinsights.com',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        connectSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://www.paypal.com',
          'https://api.paypal.com',
          'https://api.sandbox.paypal.com',
          'https://www.sandbox.paypal.com',
          ...getAppOrigins(),
        ],
        frameSrc: [
          "'self'",
          'https://www.paypal.com',
          'https://www.sandbox.paypal.com',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
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

module.exports = { ...securityConfig, getAppOrigins, getPrimaryAppUrl };
