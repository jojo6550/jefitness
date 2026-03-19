// Global Jest setup for backend unit tests (CJS version)
// Jest 'global.jest' already available in node environment - no explicit import needed

// Mock modules used across tests
jest.doMock('mongoose', () => ({
  connection: { readyState: 1 },
  Types: { 
    ObjectId: class ObjectId { 
      constructor(id) { 
        this.toString = () => id || 'mockId'; 
      } 
    } 
  },
  model: jest.fn(() => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    save: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    prototype: { 
      comparePassword: jest.fn().mockResolvedValue(true)
    }
  })),
  Schema: jest.fn(),
  connect: jest.fn(),
}));

jest.doMock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed')),
  compare: jest.fn(() => Promise.resolve(true)),
  genSalt: jest.fn(() => Promise.resolve('salt')),
}));

jest.doMock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock.jwt.token'),
  verify: jest.fn(() => ({ id: 'mockId', role: 'user' })),
  decode: jest.fn(() => ({ id: 'mockId' })),
}));

// Mock Stripe lazy init
const mockStripeInstance = {
  customers: { 
    create: jest.fn(), 
    list: jest.fn(), 
    retrieve: jest.fn(), 
    update: jest.fn()
  },
  subscriptions: { 
    create: jest.fn(), 
    retrieve: jest.fn(), 
    list: jest.fn(), 
    update: jest.fn(), 
    cancel: jest.fn()
  },
  checkout: { 
    sessions: { 
      create: jest.fn(), 
      retrieve: jest.fn() 
    } 
  },
  prices: { 
    list: jest.fn(), 
    retrieve: jest.fn() 
  },
  invoices: { list: jest.fn() },
  paymentMethods: { 
    list: jest.fn(), 
    attach: jest.fn(), 
    detach: jest.fn() 
  },
  paymentIntents: { create: jest.fn() },
  products: { 
    list: jest.fn(), 
    retrieve: jest.fn() 
  },
};
jest.doMock('stripe', () => jest.fn(() => mockStripeInstance));

jest.doMock('../services/logger', () => ({
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
jest.doMock('sanitize-html', () => jest.fn((str) => str ? str.substring(0, 100) : ''));

// Mock asyncHandler - passthrough for testing
jest.doMock('../middleware/errorHandler', () => ({
  asyncHandler: (fn) => fn,
  AuthenticationError: jest.fn().mockImplementation(() => ({})),
  ValidationError: jest.fn().mockImplementation(() => ({})),
  NotFoundError: jest.fn().mockImplementation(() => ({})),
  ExternalServiceError: jest.fn().mockImplementation(() => ({})),
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

// Mock global fetch
global.fetch = jest.fn();

// Make jest available globally for test files if needed
global.jest = jest;

