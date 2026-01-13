const request = require('supertest');
const app = require('../../../src/server');
const User = require('../../../src/models/User');
const jwt = require('jsonwebtoken');

describe('Auth Routes', () => {
  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'Password123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User created successfully. Please check your email to verify your account.');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(userData.email.toLowerCase());
    });

    it('should return 400 for invalid email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'Password123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Valid email is required');
    });

    it('should return 400 for duplicate email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@example.com',
        password: 'Password123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      // Create first user
      await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a verified user for login tests
      const user = new User({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        password: '$2b$10$bsnT1HtPeTbNT4/MCsHmXeTUpkkYjqUvVhVTeXpmXtgM7B5r3p08i', // Pre-hashed password for 'Password123!'
        isEmailVerified: true,
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      });
      await user.save();
    });

    it('should login successfully with correct credentials', async () => {
      const loginData = {
        email: 'jane.smith@example.com',
        password: 'Password123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(loginData.email);
    });

    it('should return 401 for incorrect password', async () => {
      const loginData = {
        email: 'jane.smith@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    beforeEach(async () => {
      const user = new User({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: '$2a$10$hashedpassword',
        isEmailVerified: true
      });
      await user.save();
    });

    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('If an account with that email exists, a password reset link has been sent.');
    });

    it('should not reveal if email exists or not', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('If an account with that email exists, a password reset link has been sent.');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let token;
    let user;

    beforeEach(async () => {
      user = new User({
        firstName: 'Auth',
        lastName: 'Test',
        email: 'auth.test@example.com',
        password: '$2a$10$hashedpassword',
        isEmailVerified: true
      });
      await user.save();

      token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(user.email);
      expect(response.body.user.firstName).toBe(user.firstName);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });
  });
});
