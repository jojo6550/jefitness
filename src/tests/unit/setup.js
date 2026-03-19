/* eslint-disable no-undef */
// Global Jest setup for backend unit tests
// Run with: jest --setupFilesAfterEnv src/tests/unit/setup.js

import { jest } from '@jest/globals';

// Mock modules used across tests
jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
  Types: { ObjectId: class ObjectId { constructor(id) { this.toString = () => id || 'mockId'; } } },
  model: jest.fn(() => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    save: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    prototype: { comparePassword: jest.fn() }
  })),
  Schema: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed')),
  compare: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock.jwt.token'),
  verify: jest.fn(() => ({ id: 'mockId', role: 'user' })),
}));

// Mock Stripe lazy init
const mockStripeInstance = {
  customers: { create: jest.fn(), list: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
  subscriptions: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn(), update: jest.fn(), cancel: jest.fn() },
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  prices: { list: jest.fn(), retrieve: jest.fn() },
  invoices: { list: jest.fn() },
  paymentMethods: { list: jest.fn(), attach: jest.fn(), detach: jest.fn() },
  paymentIntents: { create: jest.fn() },
  products: { list: jest.fn(), retrieve: jest.fn() },
};
jest.mock('stripe', () => jest.fn(() => mockStripeInstance));

jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(), 
    error: jest.fn(),
    debug: jest.fn(),
  },
  logUserAction: jest.fn(),
  logSecurityEvent: jest.fn(),
}));

// Mock sanitize-html
jest.mock('sanitize-html', () => jest.fn((str) => str.substring(0, 100)));

// Mock asyncHandler - passthrough for testing
jest.mock('../middleware/errorHandler', () => ({
  asyncHandler: (fn) => fn,
  AuthenticationError: jest.fn(),
  ValidationError: jest.fn(),
  NotFoundError: jest.fn(),
  ExternalServiceError: jest.fn(),
}));

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Console error spy for unhandled errors
const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => {
  consoleSpy.mockRestore();
});

global.fetch = jest.fn();

