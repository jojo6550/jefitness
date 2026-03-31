const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * SECURITY: Production-ready identity-aware rate limit key generator (v7+ compatible)
 * Prioritizes: userId > email/username > normalized IP address
 * ✅ Uses ipKeyGenerator for IPv6 compatibility and Cloudflare support
 */
const identityAwareKeyGenerator = req => {
  // SECURITY: Most specific - authenticated user ID
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }

  // SECURITY: Auth/signup routes - use email to prevent username enumeration via IP rotation
  if (req.body && req.body.email) {
    return `email:${req.body.email.toLowerCase().trim()}`;
  }

  // SECURITY: Fallback to properly normalized IP (IPv6-safe, Cloudflare compatible)
  // Fixes ERR_ERL_KEY_GEN_IPV6 error
  return ipKeyGenerator(req);
};

/**
 * SECURITY: Authentication attempts (login)
 * Protects against brute-force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per identity
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many authentication attempts from this account/IP. Try again in 15 minutes.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const identifier = identityAwareKeyGenerator(req);
    const clientIP = ipKeyGenerator(req);
    console.warn(
      `🔒 Security: auth_rate_limit_exceeded | ID:${identifier} | IP:${clientIP} | Path:${req.path}`
    );
    res.status(429).json({ ...options.message, code: 'RATE_LIMIT_EXCEEDED' });
  },
});

/**
 * SECURITY: Signup attempts (NEW)
 * Prevents signup abuse, spam accounts, enumeration
 */
const signupLimiter = rateLimit({
  windowMs: 20 * 60 * 1000, // 20 minutes (slightly longer for signup)
  max: 8, // 8 signup attempts per identity
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many signup attempts from this IP/email. Try again in 20 minutes.',
    retryAfter: 20 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const identifier = identityAwareKeyGenerator(req);
    const clientIP = ipKeyGenerator(req);
    console.warn(
      `🔒 Security: signup_rate_limit_exceeded | ID:${identifier} | IP:${clientIP} | Path:${req.path}`
    );
    res.status(429).json({ ...options.message, code: 'RATE_LIMIT_EXCEEDED' });
  },
});

/**
 * SECURITY: Password reset requests
 * Prevents reset abuse and enumeration attacks
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Very strict
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many password reset requests. Try again in 1 hour.',
    retryAfter: 60 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const identifier = identityAwareKeyGenerator(req);
    const clientIP = ipKeyGenerator(req);
    console.warn(
      `🔒 Security: password_reset_rate_limit_exceeded | ID:${identifier} | IP:${clientIP}`
    );
    res.status(429).json({ ...options.message, code: 'RATE_LIMIT_EXCEEDED' });
  },
});

/**
 * SECURITY: Checkout/Payment attempts
 * Prevents payment fraud and duplicate charges
 */
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many checkout attempts. Try again in 15 minutes.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successes too for payment protection
  handler: (req, res, next, options) => {
    const identifier = identityAwareKeyGenerator(req);
    const clientIP = ipKeyGenerator(req);
    console.warn(
      `🔒 Security: checkout_rate_limit_exceeded | ID:${identifier} | IP:${clientIP} | Path:${req.path}`
    );
    res.status(429).json({ ...options.message, code: 'RATE_LIMIT_EXCEEDED' });
  },
});

/**
 * SECURITY: General API requests
 * Base protection against DDoS and abuse
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many API requests. Rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * SECURITY: Admin operations (strictest)
 * Protects sensitive admin endpoints
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  keyGenerator: identityAwareKeyGenerator,
  message: {
    msg: 'Too many admin requests. Try again in 15 minutes.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const identifier = identityAwareKeyGenerator(req);
    const clientIP = ipKeyGenerator(req);
    console.warn(
      `🔒 Security: admin_rate_limit_exceeded | ID:${identifier} | IP:${clientIP} | Path:${req.path}`
    );
    res.status(429).json({ ...options.message, code: 'RATE_LIMIT_EXCEEDED' });
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  signupLimiter, // NEW: Production-ready signup protection
  passwordResetLimiter,
  checkoutLimiter,
  adminLimiter,
};
