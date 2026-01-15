// Backend test setup file
// This file runs before all backend tests

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// In-memory MongoDB instance for testing
let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_stripe_key';
  
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(mongoUri);
});

// Cleanup after each test
afterEach(async () => {
  // Clear all collections after each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close mongoose connection
  await mongoose.disconnect();
  
  // Stop in-memory MongoDB
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Suppress console errors during tests (optional)
global.console = {
  ...console,
  error: jest.fn(), // Mock console.error
  warn: jest.fn(), // Mock console.warn
};