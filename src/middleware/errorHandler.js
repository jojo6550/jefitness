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

  // Log based on error type
  if (statusCode >= 500) {
    logError(err, logContext);
  } else if (err instanceof AuthenticationError || err instanceof AuthorizationError) {
    // Log security-related errors
    logSecurityEvent(
      err instanceof AuthenticationError ? 'AUTH_ERROR' : 'AUTHORIZATION_ERROR',
      req.user?.id || 'unknown',
      { message, ...context },
      req
    ).catch(e => console.error('Failed to log security event:', e.message));
  } else {
    logError(err, logContext);
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

  // Include stack trace in development mode only
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    if (context.originalError) {
      errorResponse.error.originalError = context.originalError;
    }
  }

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
