/**
 * Error Handler Middleware
 * Comprehensive error handling for all application errors
 */

const { logError, logSecurityEvent } = require('../services/logger');

// Custom error class for application errors
class AppError extends Error {
  constructor(message, statusCode, context = {}) {
    super(message);
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// Custom error class for validation errors
class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, { errors });
  }
}

// Custom error class for authentication errors
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, { type: 'AUTHENTICATION_ERROR' });
  }
}

// Custom error class for authorization errors
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, { type: 'AUTHORIZATION_ERROR' });
  }
}

// Custom error class for not found errors
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, { type: 'NOT_FOUND_ERROR' });
  }
}

// Custom error class for database errors
class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, { 
      type: 'DATABASE_ERROR',
      originalError: originalError ? originalError.message : null
    });
  }
}

// Custom error class for external service errors
class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service} error: ${message}`, 503, { 
      type: 'EXTERNAL_SERVICE_ERROR',
      service
    });
  }
}

/**
 * Global error handler middleware
 * Should be the last middleware in the Express app
 */
const errorHandler = (err, req, res, next) => {
  // Set default error properties
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let context = err.context || {};

  // SECURITY: Mask error messages for 5xx errors to prevent information disclosure
  // Don't expose internal details, stack traces, or database errors to clients
  if (statusCode >= 500 && !err.statusCode) {
    message = 'Internal server error';
  }
  
  // SECURITY: Normalize 4xx error messages to avoid leaking information
  if (statusCode === 404 && !err.statusCode) {
    message = 'Resource not found';
  }

  // Log the error
  const logContext = {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id,
    ...context
  };

  // Add user info if available
  if (req.user) {
    logContext.userId = req.user.id;
  }

  // Safely log errors - prevent logging failures from causing additional errors
  const safeLogError = () => {
    try {
      if (statusCode >= 500) {
        console.error(`[ERROR] ${err.message}`, { ...logContext, stack: err.stack });
      } else {
        console.warn(`[WARN] ${err.message}`, logContext);
      }
    } catch (loggingError) {
      console.error('Error logging failed:', loggingError.message);
    }
  };

  // Safely log security events - fire and forget with proper error handling
  const safeLogSecurityEvent = () => {
    if (logSecurityEvent) {
      logSecurityEvent(
        err instanceof AuthenticationError ? 'AUTH_ERROR' : 'AUTHORIZATION_ERROR',
        req.user?.id || 'unknown',
        { message, ...context },
        req
      ).catch(securityLogError => {
        console.error('Security event logging failed:', securityLogError.message);
      });
    }
  };

  // Execute logging - fire and forget but handle errors
  if (statusCode >= 500) {
    safeLogError();
  } else if (err instanceof AuthenticationError || err instanceof AuthorizationError) {
    safeLogSecurityEvent();
  } else {
    safeLogError();
  }

  // Prevent duplicate headers being sent
  if (res.headersSent) {
    return next(err);
  }

  // Build error response
  const errorResponse = {
    error: {
      message,
      status: statusCode,
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  };

  // Include validation errors if present
  if (context.errors && Array.isArray(context.errors)) {
    errorResponse.error.errors = context.errors;
  }

  // SECURITY: Include stack trace in development mode only
  // Never expose stack traces in production as they reveal internal structure
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    if (context.originalError) {
      errorResponse.error.originalError = context.originalError;
    }
  }
  // SECURITY: Explicitly remove stack in production

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async route wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError
};
