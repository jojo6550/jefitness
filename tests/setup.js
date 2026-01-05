const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Create in-memory MongoDB server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect to the in-memory database
  await mongoose.connect(mongoUri);

  // Set test environment variables
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.MAILJET_API_KEY = 'test-api-key';
  process.env.MAILJET_SECRET_KEY = 'test-secret-key';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.CLEANUP_TIME = '30';
  process.env.CRON_SCHEDULE = '*/30 * * * *';
});

// Cleanup after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Teardown after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};