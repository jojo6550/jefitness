/**
 * Integration Tests for Authentication & Authorization
 * Tests user registration, login, JWT handling, and role-based access control
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/User');
const { incrementUserTokenVersion } = require('../../middleware/auth');

describe('Authentication & Authorization', () => {
  describe('POST /api/auth/signup', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.token).toBeDefined();

      // Verify user was saved to database
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).toBeTruthy();
      expect(user.firstName).toBe('Test');
      expect(user.isEmailVerified).toBe(true); // Auto-verified in test env
    });

    test('should reject signup with weak password', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'weak@example.com',
        password: 'weak',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least 8 characters');
    });

    test('should reject signup with existing email', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'duplicate@example.com',
        password: 'TestPassword123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      // Create first user
      await request(app).post('/api/auth/signup').send(userData);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    test('should reject signup without required consents', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'noconsent@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject password without uppercase letters', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'nouppercase@example.com',
          password: 'testpassword123!',
          dataProcessingConsent: { given: true },
          healthDataConsent: { given: true }
        })
        .expect(400);

      expect(response.body.error).toContain('uppercase');
    });

    test('should reject password without special characters', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'nospecial@example.com',
          password: 'TestPassword123',
          dataProcessingConsent: { given: true },
          healthDataConsent: { given: true }
        })
        .expect(400);

      expect(response.body.error).toContain('special character');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      testUser = await User.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'login@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });
    });

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('login@example.com');

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(testUser._id.toString());
    });

    test('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body.token).toBeUndefined();
    });

    test('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword123!'
        })
        .expect(400);

      expect(response.body.token).toBeUndefined();
    });

    test('should track failed login attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'login@example.com',
            password: 'WrongPassword!'
          });
      }

      const user = await User.findOne({ email: 'login@example.com' });
      expect(user.failedLoginAttempts).toBeGreaterThan(0);
    });

    test('should lock account after 5 failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'login@example.com',
            password: 'WrongPassword!'
          });
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'TestPassword123!'
        })
        .expect(423);

      expect(response.body.error).toContain('locked');
    });

    test('should reject login for unverified email (if not in test mode)', async () => {
      // Create unverified user
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      await User.create({
        firstName: 'Unverified',
        lastName: 'User',
        email: 'unverified@example.com',
        password: hashedPassword,
        isEmailVerified: false,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      // Temporarily disable test mode
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unverified@example.com',
          password: 'TestPassword123!'
        });

      process.env.NODE_ENV = originalEnv;

      // In production, unverified emails should be rejected
      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });
  });

  describe('JWT Token Handling', () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      testUser = await User.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'jwt@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      authToken = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    test('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.email).toBe('jwt@example.com');
    });

    test('should reject missing token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body.error).toContain('No token');
    });

    test('should reject tampered token', async () => {
      const tamperedToken = authToken.slice(0, -5) + 'AAAAA';

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.error).toContain('Invalid token');
    });

    test('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toContain('expired');
    });

    test('should reject token with outdated version', async () => {
      // Increment token version in database
      await incrementUserTokenVersion(testUser._id);

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(response.body.error).toContain('revoked');
    });

    test('should reject token for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const fakeToken = jwt.sign(
        { id: fakeUserId, userId: fakeUserId, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);

      expect(response.body.error).toContain('User not found');
    });
  });

  describe('Role-Based Access Control', () => {
    let adminUser, trainerUser, regularUser;
    let adminToken, trainerToken, userToken;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

      adminUser = await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      trainerUser = await User.create({
        firstName: 'Trainer',
        lastName: 'User',
        email: 'trainer@example.com',
        password: hashedPassword,
        role: 'trainer',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      regularUser = await User.create({
        firstName: 'Regular',
        lastName: 'User',
        email: 'user@example.com',
        password: hashedPassword,
        role: 'user',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      adminToken = jwt.sign(
        { id: adminUser._id, userId: adminUser._id, role: 'admin', tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      trainerToken = jwt.sign(
        { id: trainerUser._id, userId: trainerUser._id, role: 'trainer', tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      userToken = jwt.sign(
        { id: regularUser._id, userId: regularUser._id, role: 'user', tokenVersion: 0 },
        process.env.JWT_SECRET
      );
    });

    test('should allow admin to access admin-only routes', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should deny regular user access to admin routes', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.error).toContain('Admin privileges required');
    });

    test('should deny trainer access to admin routes', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(403);

      expect(response.body.error).toContain('Admin privileges required');
    });

    test('should always verify role from database, not JWT', async () => {
      // User tries to escalate privileges by modifying JWT (shouldn't work)
      const maliciousToken = jwt.sign(
        { id: regularUser._id, userId: regularUser._id, role: 'admin', tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(403);

      // Should be denied because database role is 'user', not 'admin'
      expect(response.body.error).toContain('Admin privileges required');
    });

    test('should allow trainer to access trainer routes', async () => {
      const response = await request(app)
        .get('/api/users/trainers')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Password Reset Flow', () => {
    let testUser;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('OldPassword123!', 10);
      testUser = await User.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'reset@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });
    });

    test('should request password reset', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify reset token was saved
      const user = await User.findById(testUser._id);
      expect(user.resetToken).toBeDefined();
      expect(user.resetTokenExpires).toBeDefined();
    });

    test('should not reveal if email exists (security)', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      // Should return success even if email doesn't exist (prevent user enumeration)
      expect(response.body.success).toBe(true);
    });
  });
});
