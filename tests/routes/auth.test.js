const request = require('supertest');
const express = require('express');
const authRouter = require('../../src/routes/auth');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock mailjet
jest.mock('node-mailjet', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      post: jest.fn().mockReturnValue({
        request: jest.fn().mockResolvedValue({ body: { Messages: [{ Status: 'success' }] } })
      })
    }))
  };
});

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes', () => {
  describe('POST /api/auth/signup', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.msg).toContain('Signup successful');
      expect(response.body.email).toBe(userData.email);

      const user = await User.findOne({ email: userData.email });
      expect(user).toBeDefined();
      expect(user.firstName).toBe(userData.firstName);
      expect(user.isEmailVerified).toBe(false);
    });

    test('should reject signup with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.msg).toBe('Validation failed');
    });

    test('should reject weak password', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'weak'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.msg).toContain('Password must be at least 8 characters');
    });

    test('should reject password without uppercase', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'test123!@#'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.msg).toContain('uppercase');
    });

    test('should reject duplicate email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'duplicate@example.com',
        password: 'Test123!@#'
      };

      await request(app).post('/api/auth/signup').send(userData);

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.msg).toBe('User already exists.');
    });

    test('should normalize email to lowercase', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN@EXAMPLE.COM',
        password: 'Test123!@#'
      };

      await request(app).post('/api/auth/signup').send(userData).expect(201);

      const user = await User.findOne({ email: 'john@example.com' });
      expect(user).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('Test123!@#', 10);
      await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: hashedPassword,
        isEmailVerified: true
      });
    });

    test('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('john@example.com');
    });

    test('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'WrongPassword123!@#'
        })
        .expect(400);

      expect(response.body.msg).toBe('Invalid credentials');
    });

    test('should reject login for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!@#'
        })
        .expect(400);

      expect(response.body.msg).toBe('Invalid credentials');
    });

    test('should reject login for unverified email', async () => {
      const hashedPassword = await bcrypt.hash('Test123!@#', 10);
      await User.create({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: hashedPassword,
        isEmailVerified: false
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'Test123!@#'
        })
        .expect(400);

      expect(response.body.msg).toContain('verify your email');
    });

    test('should lock account after 5 failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'john@example.com',
            password: 'WrongPassword'
          });
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'Test123!@#'
        })
        .expect(423);

      expect(response.body.msg).toContain('Account is locked');
    });

    test('should reset failed attempts on successful login', async () => {
      const user = await User.findOne({ email: 'john@example.com' });
      user.failedLoginAttempts = 3;
      await user.save();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const updatedUser = await User.findOne({ email: 'john@example.com' });
      expect(updatedUser.failedLoginAttempts).toBe(0);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    beforeEach(async () => {
      await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        isEmailVerified: false,
        emailVerificationToken: '123456',
        emailVerificationExpires: new Date(Date.now() + 10 * 60 * 1000)
      });
    });

    test('should verify email with valid OTP', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: 'john@example.com',
          otp: '123456'
        })
        .expect(200);

      expect(response.body.msg).toContain('Email verified successfully');
      expect(response.body.token).toBeDefined();

      const user = await User.findOne({ email: 'john@example.com' });
      expect(user.isEmailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeUndefined();
    });

    test('should reject invalid OTP', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: 'john@example.com',
          otp: '999999'
        })
        .expect(400);

      expect(response.body.msg).toBe('Invalid OTP.');
    });

    test('should reject expired OTP', async () => {
      const user = await User.findOne({ email: 'john@example.com' });
      user.emailVerificationExpires = new Date(Date.now() - 1000);
      await user.save();

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: 'john@example.com',
          otp: '123456'
        })
        .expect(400);

      expect(response.body.msg).toContain('OTP has expired');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    beforeEach(async () => {
      await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        isEmailVerified: true
      });
    });

    test('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'john@example.com' })
        .expect(200);

      expect(response.body.msg).toContain('reset link has been sent');

      const user = await User.findOne({ email: 'john@example.com' });
      expect(user.resetToken).toBeDefined();
      expect(user.resetExpires).toBeDefined();
    });

    test('should not reveal if user does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.msg).toContain('reset link has been sent');
    });
  });

  describe('GET /api/auth/me', () => {
    let token;
    let user;

    beforeEach(async () => {
      user = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        isEmailVerified: true
      });

      token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    });

    test('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.email).toBe('john@example.com');
      expect(response.body.firstName).toBe('John');
      expect(response.body.password).toBeUndefined();
    });

    test('should reject request without token', async () => {
      await request(app).get('/api/auth/me').expect(401);
    });
  });

  describe('PUT /api/auth/profile', () => {
    let token;
    let user;

    beforeEach(async () => {
      user = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        isEmailVerified: true
      });

      token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    });

    test('should update user profile', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Jane',
          phone: '1234567890',
          currentWeight: 150
        })
        .expect(200);

      expect(response.body.user.firstName).toBe('Jane');
      expect(response.body.user.phone).toBe('1234567890');
      expect(response.body.user.currentWeight).toBe(150);
    });

    test('should update only provided fields', async () => {
      await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Jane' })
        .expect(200);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.firstName).toBe('Jane');
      expect(updatedUser.lastName).toBe('Doe'); // Unchanged
    });
  });

  describe('Nutrition Logs', () => {
    let token;
    let user;

    beforeEach(async () => {
      user = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        isEmailVerified: true
      });

      token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    });

    test('should add nutrition log', async () => {
      const nutritionData = {
        id: 1,
        date: '2026-01-05',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      };

      const response = await request(app)
        .post('/api/auth/nutrition')
        .set('Authorization', `Bearer ${token}`)
        .send(nutritionData)
        .expect(201);

      expect(response.body.nutritionLogs).toHaveLength(1);
      expect(response.body.nutritionLogs[0].foodItem).toBe('Oatmeal');
    });

    test('should get nutrition logs', async () => {
      user.nutritionLogs.push({
        id: 1,
        date: '2026-01-05',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      });
      await user.save();

      const response = await request(app)
        .get('/api/auth/nutrition')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].foodItem).toBe('Oatmeal');
    });

    test('should delete nutrition log', async () => {
      user.nutritionLogs.push({
        id: 1,
        date: '2026-01-05',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      });
      await user.save();

      const response = await request(app)
        .delete('/api/auth/nutrition/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.nutritionLogs).toHaveLength(0);
    });
  });
});