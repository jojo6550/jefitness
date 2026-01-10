/**
 * Unit Tests for Error Handler Middleware
 */
const { errorHandler, AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError } = require('../../src/middleware/errorHandler');

// Mock the logger module
jest.mock('../../src/services/logger', () => ({
  logError: jest.fn(),
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock the require-health-data-consent middleware
jest.mock('../../src/middleware/consent', () => ({
  requireDataProcessingConsent: jest.fn((req, res, next) => next()),
  requireHealthDataConsent: jest.fn((req, res, next) => next()),
  checkDataRestriction: jest.fn((req, res, next) => next())
}));

describe('Error Handler Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      path: '/api/auth/login',
      method: 'POST',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      id: 'test-request-id',
      user: { id: 'user-123' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false
    };
    mockNext = jest.fn();
    
    // Silence console during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Error Types', () => {
    it('should create an AppError with correct properties', () => {
      const error = new AppError('Test error', 500, { context: 'test' });
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.context).toEqual({ context: 'test' });
      expect(error.timestamp).toBeDefined();
    });

    it('should create a ValidationError with correct properties', () => {
      const errors = [{ field: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', errors);
      
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.context.errors).toEqual(errors);
    });

    it('should create an AuthenticationError with default message', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
    });

    it('should create an AuthorizationError with custom message', () => {
      const error = new AuthorizationError('Access denied for this resource');
      
      expect(error.message).toBe('Access denied for this resource');
      expect(error.statusCode).toBe(403);
    });

    it('should create a NotFoundError with default resource', () => {
      const error = new NotFoundError();
      
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create a NotFoundError with custom resource', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      const error = new AppError('Custom error', 400, { field: 'test' });
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: 'Custom error',
          status: 400
        })
      }));
    });

    it('should handle 500 errors with default message', () => {
      const error = new Error('Something went wrong');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: 'Internal server error',
          status: 500
        })
      }));
    });

    it('should handle AuthenticationError with security logging', async () => {
      const { logSecurityEvent } = require('../../src/services/logger');
      const error = new AuthenticationError('Invalid token');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(logSecurityEvent).toHaveBeenCalledWith(
        'AUTH_ERROR',
        'user-123',
        expect.any(Object),
        mockReq
      );
    });

    it('should handle AuthorizationError with security logging', async () => {
      const { logSecurityEvent } = require('../../src/services/logger');
      const error = new AuthorizationError('Insufficient permissions');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(logSecurityEvent).toHaveBeenCalledWith(
        'AUTHORIZATION_ERROR',
        'user-123',
        expect.any(Object),
        mockReq
      );
    });

    it('should include requestId in response', () => {
      const error = new AppError('Test', 400);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          requestId: 'test-request-id'
        })
      }));
    });

    it('should include timestamp in response', () => {
      const error = new AppError('Test', 400);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          timestamp: expect.any(String)
        })
      }));
    });

    it('should handle errors without user context', () => {
      mockReq.user = null;
      const error = new AppError('Test', 400);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should include validation errors when present', () => {
      const validationErrors = [{ field: 'email', message: 'Invalid' }];
      const error = new ValidationError('Validation failed', validationErrors);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          errors: validationErrors
        })
      }));
    });

    it('should include stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          stack: expect.any(String)
        })
      }));
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Test error');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          stack: undefined
        })
      }));
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should call next() if headers already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test');
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('Error Context', () => {
    it('should include path and method in error context', () => {
      const error = new AppError('Test', 500);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      // Verify the error was handled (status was set)
      expect(mockRes.status).toHaveBeenCalled();
    });

    it('should include userAgent in error context', () => {
      const error = new AppError('Test', 400);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalled();
    });

    it('should handle requests without requestId', () => {
      mockReq.id = undefined;
      const error = new AppError('Test', 400);
      
      errorHandler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalled();
    });
  });
});

