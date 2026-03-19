import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import authController from '../../../controllers/authController.js';
import User from '../../../models/User.js';
import { AuthenticationError, ValidationError, ExternalServiceError } from '../../../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '../../../services/logger.js';

// Mock asyncHandler - already in setup.js but explicit here
const mockAsyncHandler = (fn) => fn;

describe('authController', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    
    // Reset model mocks
    User.findOne.mockReset();
    User.prototype.save.mockReset();
    User.prototype.comparePassword.mockReset();
    bcrypt.compare.mockReset();
    jwt.sign.mockReset();
    logger.info.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('should create new user and return token - happy path', async () => {
      const mockUser = { _id: 'user123', firstName: 'John', lastName: 'Doe', email: 'john@example.com', role: 'user', save: jest.fn().mockResolvedValue() };
      User.findOne.mockResolvedValue(null);
      User.prototype.save.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue('valid.token');

      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe', 
        email: 'john@example.com',
        password: 'securepass123',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      await authController.signup(mockReq, mockRes, mockNext);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(mockUser.save).toHaveBeenCalled();
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 'user123', role: 'user', tokenVersion: 0 },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          token: 'valid.token',
          user: expect.objectContaining({ email: 'john@example.com' })
        })
      });
    });

    it('should throw ValidationError if user already exists', async () => {
      User.findOne.mockResolvedValue({ email: 'exists@example.com' });

      mockReq.body = { email: 'exists@example.com', password: 'pass' };

      await expect(authController.signup(mockReq, mockRes, mockNext)).rejects.toThrow(ValidationError);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should throw ExternalServiceError if no JWT_SECRET', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      mockReq.body = { email: 'test@example.com', password: 'pass' };
      User.findOne.mockResolvedValue(null);

      await expect(authController.signup(mockReq, mockRes, mockNext)).rejects.toThrow(ExternalServiceError);
      
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('login', () => {
    it('should login valid user and log timings', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'john@example.com',
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(),
        firstName: 'John',
        lastName: 'Doe',
        role: 'user'
      };
      User.findOne.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue('login.token');

      mockReq.body = { email: 'john@example.com', password: 'correctpass' };
      mockReq.get.mockReturnValue('req-123');

      await authController.login(mockReq, mockRes, mockNext);

      expect(mockUser.comparePassword).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
      expect(logger.info).toHaveBeenNthCalled(1, '🔐 LOGIN ATTEMPT START', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('✅ LOGIN SUCCESS', expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ token: 'login.token' })
      });
    });

    it('should fail invalid password', async () => {
      const mockUser = { comparePassword: jest.fn().mockResolvedValue(false) };
      User.findOne.mockResolvedValue(mockUser);

      mockReq.body = { email: 'wrong@example.com', password: 'wrongpass' };

      await expect(authController.login(mockReq, mockRes, mockNext)).rejects.toThrow(AuthenticationError);
      expect(logger.warn).toHaveBeenCalledWith('❌ LOGIN FAILED', expect.any(Object));
    });

    it('should fail user not found', async () => {
      User.findOne.mockResolvedValue(null);

      mockReq.body = { email: 'nonexistent@example.com', password: 'pass' };

      await expect(authController.login(mockReq, mockRes, mockNext)).rejects.toThrow(AuthenticationError);
      expect(logger.warn).toHaveBeenCalledWith('❌ LOGIN FAILED', expect.objectContaining({ reason: 'USER_NOT_FOUND' }));
    });
  });

  describe('grantConsent', () => {
    it('should update user consents', async () => {
      const mockUser = { _id: 'user123' };
      User.findByIdAndUpdate.mockResolvedValue(mockUser);

      mockReq.user = { id: 'user123' };

      await authController.grantConsent(mockReq, mockRes, mockNext);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', expect.objectContaining({
        'dataProcessingConsent.given': true,
        'dataProcessingConsent.ipAddress': '127.0.0.1'
      }));
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Consent recorded successfully' });
    });
  });

  describe('logout', () => {
    it('should increment token version', async () => {
      const incrementMock = require('../middleware/auth').incrementUserTokenVersion;
      incrementMock.mockResolvedValue();

      mockReq.user = { id: 'user123' };

      await authController.logout(mockReq, mockRes, mockNext);

      expect(incrementMock).toHaveBeenCalledWith('user123');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
    });
  });
});

