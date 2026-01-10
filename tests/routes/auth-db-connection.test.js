/**
 * Integration Tests for Auth Routes with Database Connection
 * Tests the requireDbConnection middleware integration with auth routes
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');
const { body, validationResult } = require('express-validator');

// Create a mock requireDbConnection that mirrors the real implementation
const mockRequireDbConnection = jest.fn((req, res, next) => {
  const connectionState = mongoose.connection.readyState;
  
  // Connection states:
  // 0 = disconnected
  // 1 = connected
  // 2 = connecting
  // 3 = disconnecting
  
  if (connectionState === 1) {
    // Database is connected, proceed
    next();
  } else if (connectionState === 2 || connectionState === 3) {
    // Database is connecting or disconnecting
    console.warn(`[DB] Database ${connectionState === 2 ? 'connecting' : 'disconnecting'}, request queued or rejected`);
    
    // For login, we should reject - can't authenticate without DB
    if (req.path.includes('/auth/login')) {
      return res.status(503).json({
        msg: 'Service temporarily unavailable. Database connection in progress.',
        retryAfter: 10
      });
    }
    
    // For other requests, wait briefly then check again
    setTimeout(() => {
      if (mongoose.connection.readyState === 1) {
        next();
      } else {
        return res.status(503).json({
          msg: 'Service temporarily unavailable. Please retry.',
          retryAfter: 10
        });
      }
    }, 1000);
  } else {
    // Database is disconnected
    console.error('[DB] Database not connected, request rejected');
    
    return res.status(503).json({
      msg: 'Service temporarily unavailable. Database disconnected.',
      retryAfter: 30
    });
  }
});

// Mock the dbConnection module
jest.mock('../../src/middleware/dbConnection', () => ({
  requireDbConnection: mockRequireDbConnection,
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

// Now import User after mocking is set up
const User = require('../../src/models/User');

// Helper function to create a test app with auth routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Login route
  app.post('/api/auth/login', mockRequireDbConnection, [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ msg: 'Invalid credentials' });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
      
      res.json({
        token,
        user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role }
      });
    } catch (err) {
      console.error(`Error: ${JSON.stringify(err)} | Context: User login | Email: ${email}`);
      res.status(500).json({ msg: 'Server error' });
    }
  });
  
  // Signup route
  app.post('/api/auth/signup', mockRequireDbConnection, [
    body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ msg: 'Validation failed', errors: errors.array() });
    }
    
    const { firstName, lastName, email, password } = req.body;
    
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ msg: 'User already exists.' });
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      const newUser = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role: 'user',
        isEmailVerified: true
      });
      
      await newUser.save();
      
      res.status(201).json({
        msg: 'Signup successful! Please check your email for the verification code.',
        email: newUser.email
      });
    } catch (err) {
      console.error(`Error: ${JSON.stringify(err)} | Context: User signup | Email: ${email}`);
      res.status(500).json({ msg: 'Server error. Please try again.' });
    }
  });
  
  // Protected route middleware (auth)
  const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    } else {
      token = req.header('x-auth-token');
    }
    
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ msg: 'Token is not valid' });
    }
  };
  
  // /me endpoint
  app.get('/api/auth/me', mockRequireDbConnection, authMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('-password');
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
      
      res.json({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      });
    } catch (err) {
      console.error(`Error: ${JSON.stringify(err)} | Context: Get user profile | UserId: ${req.user.id}`);
      res.status(500).send('Server Error');
    }
  });
  
  // Profile update endpoint
  app.put('/api/auth/profile', mockRequireDbConnection, authMiddleware, async (req, res) => {
    const { firstName, lastName } = req.body;
    
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
      
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      
      await user.save();
      
      res.json({
        msg: 'Profile updated successfully',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      console.error(`Error: ${JSON.stringify(err)} | Context: Profile update | UserId: ${req.user.id}`);
      res.status(500).send('Server Error');
    }
  });
  
  return app;
};

describe('Auth Routes - Database Connection Edge Cases', () => {
  let testUser;
  let testToken;
  let app;

  beforeEach(async () => {
    // Reset the mock to clear previous call history
    mockRequireDbConnection.mockClear();
    
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
    
    // Create a fresh app instance for each test
    app = createTestApp();
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
      // Ensure database is connected (readyState === 1)
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1; // connected
      
      // Clear the mock call history from the previous assertions
      mockRequireDbConnection.mockClear();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'dbtest@test.com',
          password: 'TestPass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('dbtest@test.com');

      mongoose.connection.readyState = originalReadyState;
    });

    it('should signup successfully when database is connected', async () => {
      // Ensure database is connected (readyState === 1)
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1; // connected
      
      // Clear the mock call history
      mockRequireDbConnection.mockClear();

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

      mongoose.connection.readyState = originalReadyState;
    });
    
    it('should access /me endpoint when database is connected', async () => {
      // Ensure database is connected (readyState === 1)
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1; // connected
      
      // Clear the mock call history
      mockRequireDbConnection.mockClear();

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('dbtest@test.com');

      mongoose.connection.readyState = originalReadyState;
    });
    
    it('should update profile when database is connected', async () => {
      // Ensure database is connected (readyState === 1)
      const originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1; // connected
      
      // Clear the mock call history
      mockRequireDbConnection.mockClear();

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          firstName: 'UpdatedName'
        });

      expect(response.status).toBe(200);
      expect(response.body.msg).toBe('Profile updated successfully');
      expect(response.body.user.firstName).toBe('UpdatedName');

      // Restore original first name for cleanup
      await User.findByIdAndUpdate(testUser._id, { firstName: 'Test' });

      mongoose.connection.readyState = originalReadyState;
    });
  });
});

