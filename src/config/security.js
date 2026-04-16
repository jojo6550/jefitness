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
          'https://*.stripe.com',
          ...getAppOrigins(),
        ],

        scriptSrc: [
          "'self'",
          "'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU='",
          (_req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://js.stripe.com',
          'https://checkout.stripe.com',
        ],
        scriptSrcAttr: [(_req, res) => `'nonce-${res.locals.cspNonce}'`],
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
          'https://api.stripe.com',
          ...getAppOrigins(),
        ],
        frameSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://checkout.stripe.com',
          'https://hooks.stripe.com',
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
