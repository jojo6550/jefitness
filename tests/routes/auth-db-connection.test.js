/**
 * Integration Tests for Auth Routes with Database Connection
 * Tests the requireDbConnection middleware integration with auth routes
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const app = require('../testApp');

// Mock the dbConnection middleware
jest.mock('../../src/middleware/dbConnection', () => ({
  requireDbConnection: jest.fn((req, res, next) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      next();
    } else {
      res.status(503).json({
        msg: 'Service temporarily unavailable. Database disconnected.',
        retryAfter: 30
      });
    }
  }),
  isDbConnected: jest.fn(() => {
    const mongoose = require('mongoose');
    return mongoose.connection.readyState === 1;
  }),
  getDbStatus: jest.fn(() => {
    const mongoose = require('mongoose');
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[mongoose.connection.readyState] || 'unknown';
  })
}));

describe('Auth Routes - Database Connection Edge Cases', () => {
  let testUser;
  let testToken;

  beforeEach(async () => {
    // Create test user
    const salt = await bcrypt.genSalt(10);
    testUser = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'dbtest@test.com',
      password: await bcrypt.hash('TestPass123!', salt),
      role: 'user',
      isEmailVerified: true
    });
    await testUser.save();

    // Generate token
    testToken = jwt.sign(
      { id: testUser._id, role: 'user' },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    // Clean up
    if (testUser) {
      await User.findByIdAndDelete(testUser._id);
    }
  });

  describe('Login with Database Issues', () => {
    it('should return 503 when database is disconnected', async () => {
      // Simulate database disconnection
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 0; // disconnected

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'dbtest@test.com',
          password: 'TestPass123!'
        });

      expect(response.status).toBe(503);
      expect(response.body.msg).toContain('Service temporarily unavailable');

      // Restore
      mongoose.connection.readyState = originalReadyState;
    });

    it('should return 503 when database is connecting', async () => {
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 2; // connecting

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'dbtest@test.com',
          password: 'TestPass123!'
        });

      expect(response.status).toBe(503);

      mongoose.connection.readyState = originalReadyState;
    });

    it('should return 503 when database is disconnecting', async () => {
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 3; // disconnecting

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'dbtest@test.com',
          password: 'TestPass123!'
        });

      expect(response.status).toBe(503);

      mongoose.connection.readyState = originalReadyState;
    });
  });

  describe('Signup with Database Issues', () => {
    it('should return 503 when database is disconnected on signup', async () => {
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 0; // disconnected

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'New',
          lastName: 'User',
          email: 'newuser@test.com',
          password: 'NewPass123!'
        });

      expect(response.status).toBe(503);
      expect(response.body.msg).toContain('Service temporarily unavailable');

      mongoose.connection.readyState = originalReadyState;
    });
  });

  describe('Protected Routes with Database Issues', () => {
    it('should return 503 for /me endpoint when DB is disconnected', async () => {
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 0; // disconnected

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(503);

      mongoose.connection.readyState = originalReadyState;
    });

    it('should return 503 for profile update when DB is disconnected', async () => {
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 0; // disconnected

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name'
        });

      expect(response.status).toBe(503);

      mongoose.connection.readyState = originalReadyState;
    });
  });

  describe('Normal Operation', () => {
    it('should login successfully when database is connected', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'dbtest@test.com',
          password: 'TestPass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('dbtest@test.com');
    });

    it('should signup successfully when database is connected', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'New',
          lastName: 'User',
          email: 'newuser2@test.com',
          password: 'NewPass123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.msg).toContain('Signup successful');

      // Clean up the created user
      const createdUser = await User.findOne({ email: 'newuser2@test.com' });
      if (createdUser) {
        await User.findByIdAndDelete(createdUser._id);
      }
    });
  });
});

