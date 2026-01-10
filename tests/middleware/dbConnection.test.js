/**
 * Unit Tests for Database Connection Middleware
 */
const { requireDbConnection, isDbConnected, getDbStatus } = require('../../src/middleware/dbConnection');

// Mock mongoose
jest.mock('mongoose', () => {
  const mockConnection = {
    readyState: 1 // Default to connected
  };
  
  return {
    connection: mockConnection,
    types: {}
  };
});

describe('Database Connection Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      path: '/api/auth/login',
      method: 'POST'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    
    // Reset console spy
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isDbConnected', () => {
    it('should return true when database is connected', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 1; // connected
      
      expect(isDbConnected()).toBe(true);
    });

    it('should return false when database is disconnected', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 0; // disconnected
      
      expect(isDbConnected()).toBe(false);
    });

    it('should return false when database is connecting', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 2; // connecting
      
      expect(isDbConnected()).toBe(false);
    });

    it('should return false when database is disconnecting', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 3; // disconnecting
      
      expect(isDbConnected()).toBe(false);
    });
  });

  describe('getDbStatus', () => {
    it('should return "connected" when readyState is 1', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 1;
      
      expect(getDbStatus()).toBe('connected');
    });

    it('should return "disconnected" when readyState is 0', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 0;
      
      expect(getDbStatus()).toBe('disconnected');
    });

    it('should return "connecting" when readyState is 2', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 2;
      
      expect(getDbStatus()).toBe('connecting');
    });

    it('should return "disconnecting" when readyState is 3', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 3;
      
      expect(getDbStatus()).toBe('disconnecting');
    });
  });

  describe('requireDbConnection middleware', () => {
    it('should call next() when database is connected', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 1;
      
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 503 when database is disconnected', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 0;
      
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        msg: expect.stringContaining('Service temporarily unavailable')
      }));
    });

    it('should return 503 for login path when database is connecting', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 2;
      
      mockReq.path = '/login';
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        retryAfter: 10
      }));
    });

    it('should return 503 for signup path when database is connecting', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 2;
      
      mockReq.path = '/signup';
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(503);
    });

    it('should return 503 when database is disconnecting', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 3;
      
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown readyState gracefully', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 99; // unknown state
      
      const status = getDbStatus();
      
      expect(status).toBe('unknown');
    });

    it('should return 503 when database is disconnected for non-auth routes', () => {
      const mongoose = require('mongoose');
      mongoose.connection.readyState = 0;
      
      mockReq.path = '/some-other-route';
      requireDbConnection(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        msg: expect.stringContaining('Database disconnected')
      }));
    });
  });
});

