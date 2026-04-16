// src/tests/unit/auth2faVerify.test.js
//
// Route-level tests for POST /2fa/verify.
// Covers the tokenVersion security check added to the handler.

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

// auth middleware: always passes and injects req.user + req.userDoc
jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { id: 'user123', tokenVersion: 0 };
    req.userDoc = { tokenVersion: 0 };
    next();
  },
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

const speakeasy = require('speakeasy');
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({ base32: 'SECRET', otpauth_url: 'otpauth://test' })),
  totp: { verify: jest.fn() },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,test')),
}));

// --- Import after all mocks are declared ---
const express = require('express');

const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../../models/User');
const authRouter = require('../../routes/auth');

// Build a minimal express app that mounts the auth router
const app = express();
app.use(express.json());
app.use('/', authRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a valid setupToken signed with the test secret.
 * tokenVersion defaults to 0 (matches the mocked req.user).
 */
function makeSetupToken(overrides = {}) {
  const payload = {
    id: 'user123',
    twoFactorSecret: 'SECRET',
    setupPending: true,
    tokenVersion: 0,
    ...overrides,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
}

// ---------------------------------------------------------------------------

describe('POST /2fa/verify — tokenVersion security check', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 with specific error when tokenVersion in setupToken does not match DB', async () => {
    // setupToken carries tokenVersion: 0, but the DB user has tokenVersion: 1 (bumped after logout)
    const setupToken = makeSetupToken({ tokenVersion: 0 });

    // Mock User.findById(...).select('+tokenVersion') → user with incremented tokenVersion
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ tokenVersion: 1 }),
    });

    const res = await request(app)
      .post('/2fa/verify')
      .send({ setupToken, code: '123456' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'Setup token is no longer valid. Please restart 2FA setup.',
    });
  });

  it('proceeds past the tokenVersion check when versions match', async () => {
    // setupToken carries tokenVersion: 0 and the DB user also has tokenVersion: 0
    const setupToken = makeSetupToken({ tokenVersion: 0 });

    // First findById call: tokenVersion check in the verify handler
    // Second findByIdAndUpdate call: persisting the 2FA secret after TOTP passes
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ tokenVersion: 0, twoFactorEnabled: false }),
    });
    User.findByIdAndUpdate.mockResolvedValue({});

    // Make TOTP verification succeed so the handler reaches the DB update step
    speakeasy.totp.verify.mockReturnValue(true);

    const res = await request(app)
      .post('/2fa/verify')
      .send({ setupToken, code: '123456' });

    // The tokenVersion check must have passed — the specific "no longer valid" error must not appear
    expect(res.body.error).not.toBe(
      'Setup token is no longer valid. Please restart 2FA setup.'
    );

    // Handler should succeed with 2FA enabled response
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('2FA enabled successfully');
    expect(Array.isArray(res.body.backupCodes)).toBe(true);
  });
});
