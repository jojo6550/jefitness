const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const app = require('./testApp');

describe('Auth Routes', () => {
  let adminUser, regularUser, adminToken, userToken;

  beforeEach(async () => {
    // Create test users
    const adminSalt = await bcrypt.genSalt(10);
    const userSalt = await bcrypt.genSalt(10);

    adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: await bcrypt.hash('AdminPass123!', adminSalt),
      role: 'admin',
      isEmailVerified: true
    });

    regularUser = new User({
      firstName: 'Regular',
      lastName: 'User',
      email: 'user@test.com',
      password: await bcrypt.hash('UserPass123!', userSalt),
      role: 'user',
      isEmailVerified: true
    });

    await adminUser.save();
    await regularUser.save();

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET || 'testsecret');
    userToken = jwt.sign({ id: regularUser._id, role: 'user' }, process.env.JWT_SECRET || 'testsecret');
  });

  describe('POST /api/auth/signup', () => {
    it('should create a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@test.com',
          password: 'StrongPass123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.msg).toContain('Signup successful');
      expect(response.body.email).toBe('john.doe@test.com');
    });

    it('should reject duplicate email', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'duplicate@test.com',
          password: 'StrongPass123!'
        });

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'duplicate@test.com',
          password: 'StrongPass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('User already exists.');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
          password: 'StrongPass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Validation failed');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'John',
          // Missing lastName, email, password
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Validation failed');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          password: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toContain('Password must be at least 8 characters long');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'UserPass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('user@test.com');
      expect(response.body.user.role).toBe('user');
    });

    it('should reject wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'WrongPass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'SomePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Invalid credentials');
    });

    it('should reject unverified email', async () => {
      // Create unverified user
      const unverifiedUser = new User({
        firstName: 'Unverified',
        lastName: 'User',
        email: 'unverified@test.com',
        password: await bcrypt.hash('Pass123!', await bcrypt.genSalt(10)),
        isEmailVerified: false
      });
      await unverifiedUser.save();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unverified@test.com',
          password: 'Pass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Please verify your email before logging in.');
    });

    it('should handle account lockout after failed attempts', async () => {
      // Simulate failed attempts
      regularUser.failedLoginAttempts = 5;
      regularUser.lockoutUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      await regularUser.save();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'UserPass123!'
        });

      expect(response.status).toBe(423);
      expect(response.body.msg).toContain('Account is locked');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe('Regular');
      expect(response.body.lastName).toBe('User');
      expect(response.body.email).toBe('user@test.com');
      expect(response.body.role).toBe('user');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.msg).toBe('No token, authorization denied');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(401);
      expect(response.body.msg).toBe('Token is not valid');
    });
  });

  describe('PUT /api/auth/profile', () => {
    it('should update user profile successfully', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          goals: 'Lose weight'
        });

      expect(response.status).toBe(200);
      expect(response.body.msg).toBe('Profile updated successfully');
      expect(response.body.user.firstName).toBe('Updated');
      expect(response.body.user.lastName).toBe('Name');
      expect(response.body.user.goals).toBe('Lose weight');
    });

    it('should reject unauthorized request', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .send({
          firstName: 'Hacker',
          lastName: 'Name'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/nutrition', () => {
    it('should return user nutrition logs', async () => {
      // Add nutrition log to user
      regularUser.nutritionLogs.push({
        id: 1,
        date: '2023-01-01',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      });
      await regularUser.save();

      const response = await request(app)
        .get('/api/auth/nutrition')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].foodItem).toBe('Oatmeal');
    });
  });

  describe('POST /api/auth/nutrition', () => {
    it('should add nutrition log successfully', async () => {
      const response = await request(app)
        .post('/api/auth/nutrition')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          id: 1,
          date: '2023-01-01',
          mealType: 'lunch',
          foodItem: 'Salad',
          calories: 200,
          protein: 15,
          carbs: 20,
          fats: 10
        });

      expect(response.status).toBe(201);
      expect(response.body.msg).toBe('Meal log added');
      expect(response.body.nutritionLogs).toHaveLength(1);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/nutrition')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          // Missing required fields
          date: '2023-01-01'
        });

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Please provide all required fields');
    });
  });

  describe('DELETE /api/auth/nutrition/:id', () => {
    it('should delete nutrition log successfully', async () => {
      // Add nutrition log first
      regularUser.nutritionLogs.push({
        id: 1,
        date: '2023-01-01',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      });
      await regularUser.save();

      const response = await request(app)
        .delete('/api/auth/nutrition/1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.msg).toBe('Meal log deleted');
      expect(response.body.nutritionLogs).toHaveLength(0);
    });

    it('should reject invalid meal id', async () => {
      const response = await request(app)
        .delete('/api/auth/nutrition/invalid')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe('Invalid meal id');
    });
  });
});
