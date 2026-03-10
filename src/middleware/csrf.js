const crypto = require('crypto');

/**
 * CSRF Protection Middleware
 * Generates tokens for safe methods (GET, HEAD, OPTIONS)
 * Validates tokens for state-changing methods (POST, PUT, DELETE, PATCH)
 * 
 * SECURITY: Uses in-memory storage with TTL for token management
 * Tokens are single-use and expire after 1 hour
 */
class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.tokenTTL = 60 * 60 * 1000; // 1 hour
    this.cleanupInterval = 60 * 60 * 1000; // Clean every hour
    this.startCleanup();
  }

  /**
   * Generate a new CSRF token
   * @param {Request} req - Express request object
   * @returns {string} - CSRF token
   */
  generateToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    
    this.tokens.set(token, {
      userId: req.user?.id || 'anon',
      createdAt: Date.now(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    return token;
  }

  /**
   * Verify a CSRF token from request
   * @param {Request} req - Express request object
   * @returns {Object} - { valid: boolean, error?: string }
   */
  verifyToken(req) {
    // Token can come from body field or header
    const token = req.body?._csrf || req.headers['x-csrf-token'];

    if (!token) {
      return { valid: false, error: 'CSRF token missing' };
    }

    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return { valid: false, error: 'Invalid CSRF token' };
    }

    // Check token age
    if (Date.now() - tokenData.createdAt > this.tokenTTL) {
      this.tokens.delete(token);
      return { valid: false, error: 'CSRF token expired' };
    }

    // SECURITY: Verify same user agent (prevents token theft via XSS)
    if (tokenData.userAgent !== req.get('User-Agent')) {
      console.warn(`CSRF token mismatch for user ${tokenData.userId}: UserAgent changed`);
      return { valid: false, error: 'Token mismatch' };
    }

    // SECURITY: Token is valid, delete it (single-use only)
    this.tokens.delete(token);

    return { valid: true };
  }

  /**
   * Express middleware function
   * @returns {Function} - Middleware function
   */
  middleware() {
    return (req, res, next) => {
      // Generate token for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const token = this.generateToken(req);
        res.locals.csrfToken = token;
        res.set('X-CSRF-Token', token);
        return next();
      }

      // Skip API endpoints that use JWT auth (webhooks use signature verification)
      // But require CSRF for form-based state changes
      if (req.path.startsWith('/webhooks')) {
        return next(); // Webhooks use signature verification, not CSRF
      }

      // For JSON APIs with authorization header, don't require CSRF
      // (JWT tokens provide CSRF protection implicitly)
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return next();
      }

      // For state-changing methods without JWT, verify CSRF token
      const verification = this.verifyToken(req);

      if (!verification.valid) {
        console.warn(`CSRF verification failed: ${verification.error} | IP: ${req.ip} | Path: ${req.path}`);
        return res.status(403).json({
          success: false,
          error: 'CSRF validation failed',
          details: verification.error
        });
      }

      next();
    };
  }

  /**
   * Start periodic cleanup of expired tokens
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      let cleaned = 0;
      const now = Date.now();

      for (const [token, data] of this.tokens) {
        if (now - data.createdAt > this.tokenTTL) {
          this.tokens.delete(token);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[CSRF] Cleanup: Removed ${cleaned} expired tokens`);
      }
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Get current token count (for monitoring)
   * @returns {number}
   */
  getTokenCount() {
    return this.tokens.size;
  }
}

module.exports = new CSRFProtection();
