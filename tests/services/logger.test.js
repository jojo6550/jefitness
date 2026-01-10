/**
 * Unit Tests for Logger Service
 */
const { 
  logger, 
  logError, 
  logAdminAction, 
  logUserAction, 
  logSecurityEvent, 
  logDataAccess,
  logAuthEvent,
  sendSecurityAlert
} = require('../../src/services/logger');

// Mock the Log model
jest.mock('../../src/models/Log', () => ({
  create: jest.fn()
}));

// Mock the mailjet client
jest.mock('node-mailjet', () => ({
  Client: jest.fn().mockImplementation(() => ({
    post: jest.fn().mockReturnValue({
      request: jest.fn().mockResolvedValue({
        body: {
          Messages: [{ To: [{ 'MessageID': 'test-msg-id' }] }]
        }
      })
    })
  }))
}));

// Mock mongoose
jest.mock('mongoose', () => ({
  connection: {
    readyState: 1 // Default to connected
  }
}));

describe('Logger Service', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      info: jest.spyOn(console, 'info').mockImplementation(() => {})
    };
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset mongoose mock
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logger object', () => {
    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should log info messages', () => {
      logger.info('Test info message', { key: 'value' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.objectContaining({ key: 'value' })
      );
    });

    it('should log error messages', () => {
      logger.error('Test error message', { key: 'value' });
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({ key: 'value' })
      );
    });

    it('should log warn messages', () => {
      logger.warn('Test warn message', { key: 'value' });
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.objectContaining({ key: 'value' })
      );
    });
  });

  describe('logError', () => {
    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      
      logError(error, { context: 'test' });
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error'),
        expect.objectContaining({
          stack: 'Error stack trace',
          context: 'test'
        })
      );
    });
  });

  describe('logAdminAction', () => {
    it('should log admin actions', () => {
      logAdminAction('USER_DELETED', 'admin-123', { userId: 'user-456' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Admin action: USER_DELETED'),
        expect.objectContaining({
          adminId: 'admin-123',
          details: { userId: 'user-456' },
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('logUserAction', () => {
    it('should log user actions', () => {
      logUserAction('LOGIN_SUCCESS', 'user-123', { ip: '127.0.0.1' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('User action: LOGIN_SUCCESS'),
        expect.objectContaining({
          userId: 'user-123',
          details: { ip: '127.0.0.1' }
        })
      );
    });
  });

  describe('logSecurityEvent', () => {
    const mockReq = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      path: '/api/auth/login',
      method: 'POST',
      id: 'test-req-id'
    };

    beforeEach(() => {
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
    });

    it('should log security event to database', async () => {
      const Log = require('../../src/models/Log');
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' }, mockReq);
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error',
        category: 'security',
        userId: 'user-123'
      }));
    });

    it('should log to console when DB is connected', async () => {
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' }, mockReq);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Security Event: AUTH_FAILED_LOGIN'),
        expect.any(Object)
      );
    });

    it('should skip DB save when not connected', async () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 0; // disconnected
      
      const Log = require('../../src/models/Log');
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' }, mockReq);
      
      expect(Log.create).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('DB not connected'),
        expect.objectContaining({
          userId: 'user-123',
          details: { reason: 'wrong password' }
        })
      );
    });

    it('should handle DB errors gracefully', async () => {
      const Log = require('../../src/models/Log');
      Log.create.mockRejectedValueOnce(new Error('DB connection failed'));
      
      // Should not throw
      await expect(
        logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' }, mockReq)
      ).resolves.not.toThrow();
    });

    it('should add request metadata when req is provided', async () => {
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' }, mockReq);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Security Event: AUTH_FAILED_LOGIN'),
        expect.objectContaining({
          eventType: 'AUTH_FAILED_LOGIN',
          path: '/api/auth/login',
          method: 'POST',
          timestamp: expect.any(String)
        })
      );
    });

    it('should work without request object', async () => {
      const Log = require('../../src/models/Log');
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', { reason: 'wrong password' });
      
      expect(Log.create).toHaveBeenCalled();
    });
  });

  describe('logDataAccess', () => {
    it('should call logSecurityEvent with DATA_ACCESS type', async () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        path: '/api/users',
        method: 'GET',
        id: 'test-req-id'
      };
      
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logDataAccess('user-123', 'READ', 'user_profile', { resourceId: 'profile-1' }, mockReq);
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('DATA_ACCESS')
      }));
    });
  });

  describe('logAuthEvent', () => {
    it('should call logSecurityEvent with AUTH_ type', async () => {
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logAuthEvent('LOGIN_SUCCESS', 'user-123', { ip: '127.0.0.1' });
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('AUTH_LOGIN_SUCCESS')
      }));
    });
  });

  describe('sendSecurityAlert', () => {
    it('should send alert when mailjet is configured', async () => {
      process.env.MAILJET_API_KEY = 'test-api-key';
      process.env.MAILJET_SECRET_KEY = 'test-secret-key';
      process.env.ALERT_FROM_EMAIL = 'alerts@test.com';
      process.env.ALERT_TO_EMAIL = 'admin@test.com';
      
      const logEntry = {
        userId: 'user-123',
        ip: '127.0.0.1',
        message: 'Security alert',
        metadata: {
          eventType: 'AUTH_FAILED_LOGIN',
          timestamp: new Date().toISOString()
        }
      };
      
      await sendSecurityAlert(logEntry);
      
      // Should complete without throwing
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Security alert email sent successfully'),
        expect.objectContaining({ messageId: 'test-msg-id' })
      );
    });

    it('should skip alert when mailjet is not configured', async () => {
      delete process.env.MAILJET_API_KEY;
      delete process.env.MAILJET_SECRET_KEY;
      
      const logEntry = {
        userId: 'user-123',
        message: 'Security alert',
        metadata: { eventType: 'AUTH_FAILED_LOGIN' }
      };
      
      await sendSecurityAlert(logEntry);
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Mailjet credentials not configured'),
        {}
      );
    });
  });

  describe('Security Event Levels', () => {
    it('should log AUTH_FAILED_LOGIN as error level', async () => {
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', {});
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error'
      }));
    });

    it('should log AUTH_ACCOUNT_LOCKED as error level', async () => {
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logSecurityEvent('AUTH_ACCOUNT_LOCKED', 'user-123', {});
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error'
      }));
    });

    it('should log AUTH_MULTIPLE_FAILED as warning level', async () => {
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logSecurityEvent('AUTH_MULTIPLE_FAILED', 'user-123', {});
      
      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        level: 'warn'
      }));
    });
  });

  describe('Critical Security Events', () => {
    it('should trigger alerts for AUTH_FAILED_LOGIN', async () => {
      process.env.MAILJET_API_KEY = 'test-key';
      process.env.MAILJET_SECRET_KEY = 'test-secret';
      
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logSecurityEvent('AUTH_FAILED_LOGIN', 'user-123', {});
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Security alert email sent successfully'),
        expect.objectContaining({ messageId: 'test-msg-id' })
      );
    });

    it('should trigger alerts for AUTH_ACCOUNT_LOCKED', async () => {
      process.env.MAILJET_API_KEY = 'test-key';
      process.env.MAILJET_SECRET_KEY = 'test-secret';
      
      const Log = require('../../src/models/Log');
      Log.create.mockResolvedValue({});
      
      await logSecurityEvent('AUTH_ACCOUNT_LOCKED', 'user-123', {});
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Security alert email sent successfully'),
        expect.objectContaining({ messageId: 'test-msg-id' })
      );
    });
  });
});

