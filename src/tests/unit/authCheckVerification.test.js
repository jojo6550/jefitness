// src/tests/unit/authCheckVerification.test.js
//
// Real route-level tests for POST /check-verification.
// Uses supertest against the auth router so the handler is actually invoked.

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// --- Mock mongoose so requireDbConnection passes (readyState === 1) ---
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connection: { readyState: 1 },
  };
});

// --- Mock User model before importing the router ---
jest.mock('../../models/User');

// --- Mock middleware that would reject requests in a test environment ---
jest.mock('../../middleware/rateLimiter', () => ({
  authLimiter: (_req, _res, next) => next(),
  signupLimiter: (_req, _res, next) => next(),
  verificationPollLimiter: (_req, _res, next) => next(),
  apiLimiter: (_req, _res, next) => next(),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (_req, _res, next) => next(),
  incrementUserTokenVersion: jest.fn(),
}));

jest.mock('../../middleware/inputValidator', () => ({
  preventNoSQLInjection: (_req, _res, next) => next(),
  stripDangerousFields: (_req, _res, next) => next(),
  allowOnlyFields: () => (_req, _res, next) => next(),
  validateObjectId: jest.fn(),
  handleValidationErrors: (_req, _res, next) => next(),
  limitRequestSize: (_req, _res, next) => next(),
  validateSortParam: (_req, _res, next) => next(),
}));

// Mock services that the router imports
jest.mock('../../services/email', () => ({
  sendPasswordReset: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../controllers/authController', () => ({
  signup: jest.fn((_req, res) => res.json({ success: true })),
  login: jest.fn((_req, res) => res.json({ success: true })),
  logout: jest.fn((_req, res) => res.json({ success: true })),
  getMe: jest.fn((_req, res) => res.json({ success: true })),
  grantConsent: jest.fn((_req, res) => res.json({ success: true })),
  socialConsent: jest.fn((_req, res) => res.json({ success: true })),
}));

// speakeasy and qrcode are used later in the file but not relevant to our tests
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({ base32: 'secret', otpauth_url: 'otpauth://test' })),
  totp: { verify: jest.fn(() => true) },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,test')),
}));

// --- Import after all mocks are declared ---
const express = require('express');
const request = require('supertest');
const User = require('../../models/User');
const authRouter = require('../../routes/auth');

// Build a minimal express app that mounts the auth router
const app = express();
app.use(express.json());
app.use('/', authRouter);

// ---------------------------------------------------------------------------

describe('POST /check-verification', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Case A: returns { success: true, verified: false } and no token when user has dataDeletedAt set', async () => {
    const deletedUser = {
      _id: 'user123',
      isEmailVerified: true,
      dataDeletedAt: new Date('2026-01-01'),
      email: 'test@example.com',
      role: 'user',
      tokenVersion: 0,
      firstName: 'Test',
      lastName: 'User',
    };

    // The handler calls User.findOne(...).select('+tokenVersion')
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(deletedUser),
    });

    const res = await request(app)
      .post('/check-verification')
      .send({ email: 'test@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, verified: false });
    expect(res.body.token).toBeUndefined();
  });

  it('Case B: returns { success: true, verified: true } with a token when user is verified and not deleted', async () => {
    const activeUser = {
      _id: 'user456',
      isEmailVerified: true,
      dataDeletedAt: null,
      email: 'test@example.com',
      role: 'user',
      tokenVersion: 0,
      firstName: 'Jane',
      lastName: 'Doe',
    };

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(activeUser),
    });

    const res = await request(app)
      .post('/check-verification')
      .send({ email: 'test@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verified).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });
});
