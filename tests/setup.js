const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Import all models to register schemas
require('../src/models/User');
require('../src/models/Order');
require('../src/models/Program');
require('../src/models/Cart');
require('../src/models/Chat');

// 🔴 Fail fast instead of buffering forever
mongoose.set('bufferCommands', false);

let mongoServer;

// ⬆️ Global timeout MUST be first and long
jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      downloadDir: './tmp/mongodb-binaries',
      downloadTimeout: 60000,
    },
  });

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    dbName: 'jest',
  });

  // Ensure indexes are created for unique constraints
  await mongoose.model('User').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('Program').createIndexes();
  await mongoose.model('Cart').createIndexes();

  // Test env vars
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.CLEANUP_TIME = '30';
  process.env.CRON_SCHEDULE = '*/30 * * * *';
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Optional: silence logs
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
