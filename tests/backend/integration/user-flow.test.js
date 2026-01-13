const request = require('supertest');
const app = require('../../../src/server');
const User = require('../../../src/models/User');
const jwt = require('jsonwebtoken');

// Mock Mailjet for email tests
jest.mock('node-mailjet', () => ({
  Client: jest.fn().mockImplementation(() => ({
    post: jest.fn().mockReturnValue({
      request: jest.fn().mockResolvedValue({})
    })
  }))
}));

// Mock Stripe for customer creation
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_mock_customer' }),
      update: jest.fn().mockResolvedValue({})
    }
  }));
});

describe('User Flow Integration Tests', () => {
  let testUser;
  let authToken;
  let verificationOtp;

  beforeEach(async () => {
    // Create a test user for each test
    testUser = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'test.user@example.com',
      password: '$2a$10$hashedpassword',
      isEmailVerified: false,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true }
    });
    await testUser.save();
  });

  describe('User Registration Flow', () => {
    it('should successfully register a new user', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'StrongPass123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('User created successfully');
      expect(response.body.user.email).toBe(userData.email.toLowerCase());
      expect(response.body.user.firstName).toBe(userData.firstName);

      // Verify user was created in database
      const createdUser = await User.findOne({ email: userData.email });
      expect(createdUser).toBeTruthy();
      expect(createdUser.isEmailVerified).toBe(false);
      expect(createdUser.emailVerificationToken).toBeTruthy();
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'weak',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Password must be at least 8 characters');
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'test.user@example.com', // Same as testUser
        password: 'StrongPass123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('already exists');
    });
  });

  describe('Email Verification Flow', () => {
    beforeEach(async () => {
      // Set up user with verification token
      testUser.emailVerificationToken = '123456';
      testUser.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await testUser.save();
      verificationOtp = '123456';
    });

    it('should successfully verify email with valid OTP', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: testUser.email,
          otp: verificationOtp
        })
        .expect(200);

      expect(response.body.msg).toContain('Email verified successfully');
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.email).toBe(testUser.email);

      // Verify user is now verified in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.isEmailVerified).toBe(true);
      expect(updatedUser.emailVerificationToken).toBeUndefined();
    });

    it('should reject invalid OTP', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: testUser.email,
          otp: '999999'
        })
        .expect(400);

      expect(response.body.msg).toBe('Invalid OTP.');
    });

    it('should reject expired OTP', async () => {
      // Set OTP to expired
      testUser.emailVerificationExpires = new Date(Date.now() - 1000);
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: testUser.email,
          otp: verificationOtp
        })
        .expect(400);

      expect(response.body.msg).toContain('OTP has expired');
    });
  });

  describe('Login Flow', () => {
    beforeEach(async () => {
      // Set up verified user
      testUser.isEmailVerified = true;
      testUser.password = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // 'password'
      await testUser.save();
    });

    it('should successfully login with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: 'password'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.role).toBe(testUser.role);

      authToken = response.body.token;
    });

    it('should reject login with unverified email', async () => {
      testUser.isEmailVerified = false;
      await testUser.save();

      const loginData = {
        email: testUser.email,
        password: 'password'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.msg).toBe('Please verify your email before logging in.');
    });

    it('should reject login with invalid password', async () => {
      const loginData = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should lock account after 5 failed attempts', async () => {
      const loginData = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(401);
      }

      // 6th attempt should be locked
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(423);

      expect(response.body.msg).toContain('Account is locked');
    });
  });

  describe('Profile Management Flow', () => {
    beforeEach(async () => {
      // Set up authenticated user
      testUser.isEmailVerified = true;
      await testUser.save();
      authToken = jwt.sign({ id: testUser._id, role: testUser.role }, process.env.JWT_SECRET);
    });

    it('should get user profile information', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(testUser._id.toString());
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.firstName).toBe(testUser.firstName);
    });

    it('should update user profile', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        dob: '1990-01-01',
        gender: 'male',
        phone: '+1234567890',
        goals: 'Lose weight'
      };

      const response = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.msg).toBe('Profile updated successfully');
      expect(response.body.user.firstName).toBe(updateData.firstName);
      expect(response.body.user.goals).toBe(updateData.goals);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.firstName).toBe(updateData.firstName);
      expect(updatedUser.goals).toBe(updateData.goals);
    });

    it('should manage nutrition logs', async () => {
      const mealData = {
        id: 1,
        date: '2024-01-01',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      };

      // Add meal
      const addResponse = await request(app)
        .post('/api/v1/auth/nutrition')
        .set('Authorization', `Bearer ${authToken}`)
        .send(mealData)
        .expect(201);

      expect(addResponse.body.msg).toBe('Meal log added');
      expect(addResponse.body.nutritionLogs).toHaveLength(1);

      // Get nutrition logs
      const getResponse = await request(app)
        .get('/api/v1/auth/nutrition')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].foodItem).toBe(mealData.foodItem);

      // Delete meal
      const deleteResponse = await request(app)
        .delete('/api/v1/auth/nutrition/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(deleteResponse.body.msg).toBe('Meal log deleted');
      expect(deleteResponse.body.nutritionLogs).toHaveLength(0);
    });

    it('should manage user schedule', async () => {
      const scheduleData = {
        monday: ['Cardio', 'Weights'],
        tuesday: ['Yoga'],
        wednesday: ['Rest']
      };

      // Update schedule
      const updateResponse = await request(app)
        .put('/api/v1/auth/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ schedule: scheduleData })
        .expect(200);

      expect(updateResponse.body.msg).toBe('Schedule updated successfully');
      expect(updateResponse.body.schedule.monday).toEqual(scheduleData.monday);

      // Get schedule
      const getResponse = await request(app)
        .get('/api/v1/auth/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.monday).toEqual(scheduleData.monday);
    });
  });

  describe('Password Management Flow', () => {
    beforeEach(async () => {
      testUser.isEmailVerified = true;
      await testUser.save();
      authToken = jwt.sign({ id: testUser._id, role: testUser.role }, process.env.JWT_SECRET);
    });

    it('should handle forgot password request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('password reset link has been sent');

      // Verify reset token was set
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resetToken).toBeTruthy();
      expect(updatedUser.resetExpires).toBeTruthy();
    });

    it('should reset password with valid token', async () => {
      // Set up reset token
      testUser.resetToken = 'valid-reset-token';
      testUser.resetExpires = new Date(Date.now() + 10 * 60 * 1000);
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          password: 'NewStrongPass123!'
        })
        .expect(200);

      expect(response.body.msg).toContain('Password reset successfully');

      // Verify password was updated and tokens cleared
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resetToken).toBeUndefined();
      expect(updatedUser.resetExpires).toBeUndefined();
    });

    it('should update password when authenticated', async () => {
      const updateData = {
        currentPassword: 'password', // Assuming default test password
        newPassword: 'UpdatedPass123!',
        firstName: testUser.firstName // Include to avoid validation issues
      };

      // First set a known password
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      testUser.password = await bcrypt.hash('password', salt);
      await testUser.save();

      const response = await request(app)
        .put('/api/v1/auth/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.msg).toBe('Account updated successfully');
    });
  });

  describe('Logout Flow', () => {
    beforeEach(async () => {
      testUser.isEmailVerified = true;
      await testUser.save();
      authToken = jwt.sign({ id: testUser._id, role: testUser.role }, process.env.JWT_SECRET);
    });

    it('should successfully logout user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });
  });

  describe('Access Control', () => {
    it('should deny access to protected routes without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.msg).toContain('No token');
    });

    it('should deny admin routes to regular users', async () => {
      testUser.isEmailVerified = true;
      testUser.role = 'user';
      await testUser.save();
      authToken = jwt.sign({ id: testUser._id, role: testUser.role }, process.env.JWT_SECRET);

      const response = await request(app)
        .get('/api/v1/auth/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.msg).toContain('Access denied: Admins only');
    });
  });
});
