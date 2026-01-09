/**
 * Enhanced Security Headers Middleware
 * Provides additional security headers beyond Helmet
 */

/**
 * Additional security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent browsers from inferring content type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Clickjacking protection
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');

  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cache control for sensitive endpoints
  if (req.path.includes('/api/') && !req.path.includes('/public/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

module.exports = securityHeaders;
