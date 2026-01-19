/**
 * Unit Tests for Authentication Middleware
 * Tests JWT validation, token versioning, and role verification
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const {
  auth,
  requireAdmin,
  requireTrainer,
  incrementUserTokenVersion,
  getUserTokenVersion,
  isWebhookEventProcessed,
  markWebhookEventProcessed
} = require('../../../middleware/auth');
const User = require('../../../models/User');

describe('Auth Middleware', () => {
  let testUser;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'auth@example.com',
      password: hashedPassword,
      role: 'user',
      isEmailVerified: true,
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });
  });

  describe('auth middleware', () => {
    test('should authenticate valid token', async () => {
      const token = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {};
      const next = jest.fn();

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(testUser._id.toString());
      expect(req.user.role).toBe('user');
    });

    test('should reject missing token', async () => {
      const req = {
        header: jest.fn(() => null)
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No token')
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid token', async () => {
      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return 'Bearer invalid-token';
          return null;
        })
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid token')
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject expired token', async () => {
      const token = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('expired')
        })
      );
    });

    test('should reject token with outdated version', async () => {
      const token = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      // Increment token version
      await incrementUserTokenVersion(testUser._id);

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('revoked')
        })
      );
    });

    test('should reject token for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const token = jwt.sign(
        { id: fakeUserId, userId: fakeUserId, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('User not found')
        })
      );
    });

    test('should accept token with x-auth-token header (fallback)', async () => {
      const token = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'x-auth-token') return token;
          return null;
        })
      };
      const res = {};
      const next = jest.fn();

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    test('should normalize user ID in request', async () => {
      const token = jwt.sign(
        { userId: testUser._id, tokenVersion: 0 }, // Using userId instead of id
        process.env.JWT_SECRET
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {};
      const next = jest.fn();

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe(testUser._id.toString());
    });

    test('should fetch fresh role from database', async () => {
      const token = jwt.sign(
        { id: testUser._id, userId: testUser._id, role: 'admin', tokenVersion: 0 }, // Wrong role in token
        process.env.JWT_SECRET
      );

      const req = {
        header: jest.fn((name) => {
          if (name === 'Authorization') return `Bearer ${token}`;
          return null;
        })
      };
      const res = {};
      const next = jest.fn();

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('user'); // Should be from DB, not token
    });
  });

  describe('requireAdmin middleware', () => {
    test('should allow admin users', async () => {
      const adminUser = await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        password: await bcrypt.hash('TestPassword123!', 10),
        role: 'admin',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      const req = {
        user: { id: adminUser._id.toString(), role: 'admin' }
      };
      const res = {};
      const next = jest.fn();

      await requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny non-admin users', async () => {
      const req = {
        user: { id: testUser._id.toString(), role: 'user' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Admin privileges required')
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should verify role from database, not JWT', async () => {
      // User tries to fake admin role in token
      const req = {
        user: { id: testUser._id.toString(), role: 'admin' } // Fake admin in token
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdmin(req, res, next);

      // Should be denied because DB role is 'user'
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireTrainer middleware', () => {
    test('should allow trainer users', async () => {
      const trainerUser = await User.create({
        firstName: 'Trainer',
        lastName: 'User',
        email: 'trainer@example.com',
        password: await bcrypt.hash('TestPassword123!', 10),
        role: 'trainer',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      const req = {
        user: { id: trainerUser._id.toString(), role: 'trainer' }
      };
      const res = {};
      const next = jest.fn();

      await requireTrainer(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny non-trainer users', async () => {
      const req = {
        user: { id: testUser._id.toString(), role: 'user' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireTrainer(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Trainer privileges required')
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token Version Management', () => {
    test('should increment user token version', async () => {
      const initialVersion = await getUserTokenVersion(testUser._id);

      await incrementUserTokenVersion(testUser._id);

      const newVersion = await getUserTokenVersion(testUser._id);
      expect(newVersion).toBe(initialVersion + 1);
    });

    test('should handle multiple version increments', async () => {
      const initialVersion = await getUserTokenVersion(testUser._id);

      await incrementUserTokenVersion(testUser._id);
      await incrementUserTokenVersion(testUser._id);
      await incrementUserTokenVersion(testUser._id);

      const newVersion = await getUserTokenVersion(testUser._id);
      expect(newVersion).toBe(initialVersion + 3);
    });

    test('should handle non-existent user gracefully', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();

      await expect(incrementUserTokenVersion(fakeUserId)).resolves.not.toThrow();

      const version = await getUserTokenVersion(fakeUserId);
      expect(version).toBe(0);
    });
  });

  describe('Webhook Event Processing', () => {
    test('should track processed webhook events', () => {
      const eventId = 'evt_test123';

      expect(isWebhookEventProcessed(eventId)).toBe(false);

      markWebhookEventProcessed(eventId);

      expect(isWebhookEventProcessed(eventId)).toBe(true);
    });

    test('should prevent duplicate event processing', () => {
      const eventId = 'evt_duplicate123';

      markWebhookEventProcessed(eventId);

      // Try to process again
      const isDuplicate = isWebhookEventProcessed(eventId);
      expect(isDuplicate).toBe(true);
    });

    test('should auto-cleanup old events after timeout', (done) => {
      jest.useFakeTimers();

      const eventId = 'evt_cleanup123';
      markWebhookEventProcessed(eventId);

      expect(isWebhookEventProcessed(eventId)).toBe(true);

      // Fast-forward past cleanup time (24 hours)
      jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);

      // Event should be cleaned up
      setTimeout(() => {
        expect(isWebhookEventProcessed(eventId)).toBe(false);
        jest.useRealTimers();
        done();
      }, 100);

      jest.runAllTimers();
    });
  });
});
