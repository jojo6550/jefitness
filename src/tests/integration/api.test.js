/**
 * Integration Tests for API Endpoints
 * Tests full request-response cycles with database interactions
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

// Import routes
const authRouter = require('../../routes/auth');
const usersRouter = require('../../routes/users');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

describe('API Integration Tests', () => {
  describe('Authentication Flow', () => {
    it('should complete full registration and login flow', async () => {
      // Step 1: Register new user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Integration',
          lastName: 'Test',
          email: 'integration@test.com',
          password: 'Password123!',
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.token).toBeDefined();

      // Step 2: Login with credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'integration@test.com',
          password: 'Password123!',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();

      // Step 3: Access protected route with token
      const token = loginResponse.body.token;
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.email).toBe('integration@test.com');
    });

    it('should reject duplicate email registration', async () => {
      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'First',
          lastName: 'User',
          email: 'duplicate@test.com',
          password: 'Password123!',
        });

      // Try to register again with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Second',
          lastName: 'User',
          email: 'duplicate@test.com',
          password: 'Password456!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject invalid credentials on login', async () => {
      // Register user
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'valid@test.com',
          password: 'CorrectPassword123!',
        });

      // Try login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'valid@test.com',
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('User Management Integration', () => {
    let adminToken, userToken, userId;

    beforeEach(async () => {
      // Create admin user
      const admin = await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@test.com',
        password: 'hashedPassword',
        role: 'admin',
      });
      adminToken = jwt.sign(
        { id: admin._id, userId: admin._id, role: 'admin' },
        process.env.JWT_SECRET
      );

      // Create regular user
      const user = await User.create({
        firstName: 'Regular',
        lastName: 'User',
        email: 'user@test.com',
        password: 'hashedPassword',
        role: 'user',
      });
      userId = user._id;
      userToken = jwt.sign(
        { id: user._id, userId: user._id, role: 'user' },
        process.env.JWT_SECRET
      );
    });

    it('should allow user to update own profile', async () => {
      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          firstName: 'Updated',
          goals: 'Build muscle',
        });

      expect(response.status).toBe(200);
      expect(response.body.user.firstName).toBe('Updated');
      expect(response.body.user.goals).toBe('Build muscle');

      // Verify in database
      const updatedUser = await User.findById(userId);
      expect(updatedUser.firstName).toBe('Updated');
      expect(updatedUser.goals).toBe('Build muscle');
    });

    it('should prevent user from deleting own account without admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);

      // Verify user still exists
      const user = await User.findById(userId);
      expect(user).not.toBeNull();
    });

    it('should allow admin to delete user account', async () => {
      const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      // Verify user is deleted
      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should rollback on validation errors', async () => {
      const initialCount = await User.countDocuments();

      // Try to create user with invalid data
      try {
        await User.create({
          firstName: 'Test',
          lastName: 'User',
          email: 'invalid-email', // Invalid email format
          password: 'short', // Too short password
        });
      } catch (error) {
        // Expected to fail
      }

      // Count should remain the same
      const finalCount = await User.countDocuments();
      expect(finalCount).toBe(initialCount);
    });

    it('should maintain referential integrity', async () => {
      // Create user
      const user = await User.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'ref@test.com',
        password: 'hashedPassword',
      });

      // Create subscription for user
      const subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test',
      });

      // Delete user
      await User.findByIdAndDelete(user._id);

      // Subscription should still exist (orphaned record handling)
      const orphanedSub = await Subscription.findById(subscription._id);
      expect(orphanedSub).not.toBeNull();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous requests', async () => {
      const promises = [];

      // Create 10 users simultaneously
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/auth/register')
            .send({
              firstName: `User${i}`,
              lastName: 'Test',
              email: `concurrent${i}@test.com`,
              password: 'Password123!',
            })
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result.status).toBe(201);
      });

      // Verify all users created
      const userCount = await User.countDocuments({
        email: { $regex: /^concurrent/ },
      });
      expect(userCount).toBe(10);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          // Missing lastName, email, password
        });

      expect(response.status).toBe(400);
    });

    it('should handle very long input strings', async () => {
      const longString = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: longString,
          lastName: 'Test',
          email: 'test@example.com',
          password: 'Password123!',
        });

      // Should either reject or truncate
      expect([400, 500]).toContain(response.status);
    });
  });
});