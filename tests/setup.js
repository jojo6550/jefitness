const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const app = require('../src/server');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect to in-memory database
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongoUri;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
  process.env.SIGNING_KEY = 'test-signing-key-32-chars-long';
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
  process.env.MAILJET_API_KEY = 'mock-api-key';
  process.env.MAILJET_SECRET_KEY = 'mock-secret-key';
  process.env.VAPID_PUBLIC_KEY = 'mock-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'mock-vapid-private';
});

// Cleanup after each test
afterEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close database connection
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  // Stop in-memory MongoDB server
  if (mongoServer) {
    await mongoServer.stop();
  }
});
