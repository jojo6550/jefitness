const request = require('supertest');
const app = require('../../../src/server');
const User = require('../../../src/models/User');
const jwt = require('jsonwebtoken');

describe('User Routes', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;

  beforeEach(async () => {
    // Create admin user
    adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: '$2a$10$hashedpassword',
      role: 'admin',
      isEmailVerified: true,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true }
    });
    await adminUser.save();

    // Create regular user
    regularUser = new User({
      firstName: 'Regular',
      lastName: 'User',
      email: 'user@example.com',
      password: '$2a$10$hashedpassword',
      role: 'user',
      isEmailVerified: true,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true }
    });
    await regularUser.save();

    adminToken = jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET);
    userToken = jwt.sign({ userId: regularUser._id }, process.env.JWT_SECRET);
  });

  describe('GET /api/v1/users', () => {
    it('should return all users for admin', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.users.length).toBeGreaterThanOrEqual(2);
      expect(response.body.users.some(user => user.email === adminUser.email)).toBe(true);
      expect(response.body.users.some(user => user.email === regularUser.email)).toBe(true);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. Admin role required.');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return user by id for admin', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(regularUser.email);
      expect(response.body.user.firstName).toBe(regularUser.firstName);
    });

    it('should return own profile for regular user', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(regularUser.email);
    });

    it('should return 403 when user tries to access another user profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. You can only access your own profile.');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/v1/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update user profile for admin', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        goals: 'Lose weight'
      };

      const response = await request(app)
        .put(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.firstName).toBe(updateData.firstName);
      expect(response.body.user.lastName).toBe(updateData.lastName);
      expect(response.body.user.goals).toBe(updateData.goals);
    });

    it('should allow user to update own profile', async () => {
      const updateData = {
        goals: 'Build muscle'
      };

      const response = await request(app)
        .put(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.goals).toBe(updateData.goals);
    });

    it('should return 403 when user tries to update another user', async () => {
      const updateData = { firstName: 'Hacked' };

      const response = await request(app)
        .put(`/api/v1/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. You can only update your own profile.');
    });

    it('should return 400 for invalid data', async () => {
      const updateData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .put(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('valid email');
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete user for admin', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${regularUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User deleted successfully');

      // Verify user is deleted
      const deletedUser = await User.findById(regularUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should return 403 when regular user tries to delete another user', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. Admin role required.');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/v1/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });
  });
});
