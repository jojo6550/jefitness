/**
 * Jest backend test setup
 * Node environment, global test helpers
 */

// Mock console methods to suppress noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock process env for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // random port

// Global test helpers
global.expectStripeEvent = (eventType, data) => ({
  type: eventType,
  id: `evt_${Date.now()}`,
  data: { object: data },
});

// Suppress mongoose deprecation warnings
jest.spyOn(console, 'warn').mockImplementation(() => {});

// Cleanup after each test
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

console.log('✅ Backend test setup loaded');
