import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { logger, Log } from '../../../../services/logger.js';
import winston from 'winston';

describe('logger service', () => {
  let mockTransports;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Winston transports
    mockTransports = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Mock logger instance methods
    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
    logger.logUserAction = jest.fn();
    logger.logSecurityEvent = jest.fn();
    
    Log.create = jest.fn().mockResolvedValue();
  });

  describe('log methods', () => {
    it('should log info with metadata', () => {
      const meta = { userId: '123', action: 'test' };
      
      logger.info('Test info log', meta);

      expect(logger.info).toHaveBeenCalledWith('Test info log', expect.objectContaining({
        level: 'info',
        ...meta
      }));
    });

    it('should log security event with severity', async () => {
      const mockReq = { ip: '1.2.3.4', id: 'req-456' };

      await logger.logSecurityEvent('AUTH_FAILED_LOGIN', 'user789', { attempts: 3 }, mockReq);

      expect(logger.warn).toHaveBeenCalledWith('Security Event: AUTH_FAILED_LOGIN', expect.objectContaining({
        category: 'security',
        severity: 'critical',
        ip: '1.2.3.4'
      }));
      expect(Log.create).toHaveBeenCalled();
    });

    it('should log user action', () => {
      logger.logUserAction('view_dashboard', 'user123', { widget: 'stats' });

      expect(logger.info).toHaveBeenCalledWith('User action: view_dashboard', expect.objectContaining({
        category: 'user',
        action: 'view_dashboard'
      }));
    });

    it('should log admin action', () => {
      logger.logAdminAction('user_suspend', 'admin456', { reason: 'spam' });

      expect(logger.info).toHaveBeenCalledWith('Admin action: user_suspend', expect.objectContaining({
        category: 'admin'
      }));
    });

    it('should async log errors to DB', async () => {
      const errorMeta = { error: 'DB timeout' };
      
      await logger.error('Critical error', errorMeta);

      expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({
        level: 'error',
        category: 'general',
        metadata: expect.any(Object)
      }));
    });

    it('should only DB log audit categories', async () => {
      logger.info('Regular info log', { foo: 'bar' });

      await Promise.resolve(); // Allow async

      expect(Log.create).not.toHaveBeenCalled();
    });

    it('should handle DB log failure silently', async () => {
      Log.create.mockRejectedValue(new Error('DB down'));

      await expect(logger.error('Test with DB fail', {})).resolves.not.toThrow();
    });

    it('should classify security severity correctly', async () => {
      // Critical
      await logger.logSecurityEvent('AUTH_ACCOUNT_LOCKED', 'user1');
      expect(logger.error).toHaveBeenCalled(); // Critical triggers error

      // Medium
      await logger.logSecurityEvent('LOGIN_SUCCESS', 'user2');
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('request context', () => {
    it('should capture req context in logs', () => {
      const mockReq = {
        ip: '192.168.1.1',
        id: 'req-789',
        method: 'POST',
        path: '/api/login'
      };

      logger.logUserAction('login_attempt', 'user123', {}, mockReq);

      expect(logger.info.mock.calls[0][1]).toMatchObject({
        ip: '192.168.1.1',
        requestId: 'req-789',
        method: 'POST',
        path: '/api/login'
      });
    });
  });
});

