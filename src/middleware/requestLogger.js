/**
 * Request Logging Middleware
 * Logs all incoming requests with enhanced security event tracking
 */

const { logger, logSecurityEvent } = require('../services/logger');

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  // Assign request ID
  req.id = generateRequestId();

  // Store request start time
  req.startTime = Date.now();

  // Log sensitive endpoints
  const sensitivePaths = ['/api/auth', '/api/users', '/api/medical-documents'];
  const isSensitive = sensitivePaths.some(path => req.path.includes(path));

  if (isSensitive) {
    logger.http(`${req.method} ${req.path}`, {
      requestId: req.id,
      userId: req.user?.id || 'anonymous',
      ip: req.ip,
    });
  }

  // Override res.json to log responses
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - req.startTime;

    // Log slow requests (> 1s)
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
      });
    }

    logger.http('HTTP response', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      duration: duration,
      statusCode: res.statusCode,
    });

    // Log failed authentication/authorization attempts
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecurityEvent(
        res.statusCode === 401 ? 'AUTH_FAILED' : 'AUTH_DENIED',
        req.user?.id || null,
        {
          path: req.path,
          method: req.method,
          message: data?.error?.message || 'Access attempt failed',
        },
        req
      ).catch(err =>
        logger.error('Failed to log security event', { error: err.message })
      );
    }

    // Add request ID to response headers
    res.setHeader('X-Request-Id', req.id);

    return originalJson(data);
  };

  next();
};

module.exports = {
  requestLogger,
  generateRequestId,
};
