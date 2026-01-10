const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Test env vars for jsdom environment
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CLEANUP_TIME = '30';
process.env.CRON_SCHEDULE = '*/30 * * * *';

// Optional: silence logs
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
