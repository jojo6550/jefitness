/**
 * Jest Test Setup for Backend Tests
 * Configures MongoDB Memory Server and global test utilities
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect mongoose
  await mongoose.connect(mongoUri);
  
  // Set test environment variables
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.NODE_ENV = 'test';
  
  console.log('Test database connected');
});

// Cleanup after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  console.log('Test database disconnected');
});

// Clear all collections before each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Global test timeout
jest.setTimeout(30000);

// Mock console.error to reduce noise in test output
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
