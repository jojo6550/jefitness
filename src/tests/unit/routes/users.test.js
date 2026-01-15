/**
 * Unit Tests for User Routes
 * Tests all endpoints in src/routes/users.js
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../../models/User');
const usersRouter = require('../../../routes/users');
const { auth } = require('../../../middleware/auth');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

// Helper function to generate JWT token
function generateToken(userId, role = 'user') {
  return jwt.sign(
    { id: userId, userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Users Routes - Unit Tests', () => {
  let testUser, adminUser, trainerUser;
  let userToken, adminToken, trainerToken;

  // Setup: Create test users before each test
  beforeEach(async () => {
    // Create regular user
    testUser = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'hashedPassword123',
      role: 'user',
    });

    // Create admin user
    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'hashedPassword123',
      role: 'admin',
    });

    // Create trainer user
    trainerUser = await User.create({
      firstName: 'Trainer',
      lastName: 'User',
      email: 'trainer@example.com',
      password: 'hashedPassword123',
      role: 'trainer',
    });

    // Generate tokens
    userToken = generateToken(testUser._id, 'user');
    adminToken = generateToken(adminUser._id, 'admin');
    trainerToken = generateToken(trainerUser._id, 'trainer');
  });

  describe('GET /api/users/trainers', () => {
    it('should return all trainers when authenticated', async () => {
      const response = await request(app)
        .get('/api/users/trainers')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.trainers).toHaveLength(1);
      expect(response.body.trainers[0].email).toBe('trainer@example.com');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/users/trainers');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/users/admins', () => {
    it('should return all admins when authenticated', async () => {
      const response = await request(app)
        .get('/api/users/admins')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].email).toBe('admin@example.com');
    });
  });

  describe('GET /api/users', () => {
    it('should return all users for admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.users.length).toBeGreaterThanOrEqual(3);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user profile for own ID', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('john@example.com');
      expect(response.body.user.password).toBeUndefined(); // Password should be excluded
    });

    it('should allow admin to view any user', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 403 when accessing another user profile', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('User not found');
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update own profile successfully', async () => {
      const updates = {
        firstName: 'Jane',
        goals: 'Lose weight',
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.firstName).toBe('Jane');
      expect(response.body.user.goals).toBe('Lose weight');
    });

    it('should validate email format', async () => {
      const updates = {
        email: 'invalid-email',
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updates);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('valid email');
    });

    it('should return 403 when updating another user without admin', async () => {
      const response = await request(app)
        .put(`/api/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'Hacker' });

      expect(response.status).toBe(403);
    });

    it('should allow admin to update any user', async () => {
      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'UpdatedByAdmin' });

      expect(response.status).toBe(200);
      expect(response.body.user.firstName).toBe('UpdatedByAdmin');
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should allow admin to delete user', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify user is actually deleted
      const deletedUser = await User.findById(testUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .delete(`/api/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });

    it('should return 404 when deleting non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GDPR Compliance - GET /api/users/data-export', () => {
    it('should export user data successfully', async () => {
      const response = await request(app)
        .get('/api/users/data-export')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.personalInformation).toBeDefined();
      expect(response.body.personalInformation.email).toBe('john@example.com');
      expect(response.body.fitnessData).toBeDefined();
      expect(response.body.accountData).toBeDefined();
    });

    it('should not include sensitive data in export', async () => {
      const response = await request(app)
        .get('/api/users/data-export')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.personalInformation.password).toBeUndefined();
    });
  });

  describe('GDPR Compliance - Privacy Settings', () => {
    it('should get default privacy settings', async () => {
      const response = await request(app)
        .get('/api/users/privacy-settings')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.privacySettings).toBeDefined();
      expect(response.body.accountStatus).toBe('active');
    });

    it('should update privacy settings', async () => {
      const settings = {
        marketingEmails: true,
        dataAnalytics: false,
        thirdPartySharing: false,
      };

      const response = await request(app)
        .put('/api/users/privacy-settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send(settings);

      expect(response.status).toBe(200);
      expect(response.body.privacySettings.marketingEmails).toBe(true);
      expect(response.body.privacySettings.dataAnalytics).toBe(false);
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle malformed user ID gracefully', async () => {
      const response = await request(app)
        .get('/api/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
    });

    it('should handle missing required fields in update', async () => {
      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: '' }); // Empty firstName

      expect(response.status).toBe(400);
    });
  });
});