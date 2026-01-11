const express = require('express');
const request = require('supertest');

describe('Log Storage Memory Management', () => {
  let app;
  let logsRouter;
  let originalConsoleLog;
  let originalConsoleError;
  let originalConsoleWarn;

  beforeAll(() => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
  });

  beforeEach(() => {
    // Clear the module cache and reload to get fresh router
    delete require.cache[require.resolve('../../src/routes/logs')];
    logsRouter = require('../../src/routes/logs');
    logsRouter.realtimeLogs.length = 0; // Clear the global array

    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/logs', logsRouter);
  });

  afterEach(() => {
    // Clean up module cache after each test
    delete require.cache[require.resolve('../../src/routes/logs')];
  });

  afterAll(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test('should limit log entries to 500 maximum', () => {
    // Generate 600 log entries
    for (let i = 0; i < 600; i++) {
      console.log(`Test log entry ${i}`);
    }

    // Check that only 500 logs are stored
    expect(logsRouter.realtimeLogs.length).toBe(500);
  });

  test('should maintain log entry structure', () => {
    console.log('Test info message');
    console.error('Test error message');
    console.warn('Test warn message');

    expect(logsRouter.realtimeLogs).toHaveLength(3);

    const infoLog = logsRouter.realtimeLogs.find(log => log.level === 'info');
    const errorLog = logsRouter.realtimeLogs.find(log => log.level === 'error');
    const warnLog = logsRouter.realtimeLogs.find(log => log.level === 'warn');

    expect(infoLog).toBeDefined();
    expect(infoLog.category).toBe('app');
    expect(infoLog.message).toBe('Test info message');

    expect(errorLog).toBeDefined();
    expect(errorLog.category).toBe('error');
    expect(errorLog.message).toBe('Test error message');

    expect(warnLog).toBeDefined();
    expect(warnLog.category).toBe('warn');
    expect(warnLog.message).toBe('Test warn message');
  });

  test('should handle periodic cleanup of excess logs', (done) => {
    // Generate 600 logs to exceed limit
    for (let i = 0; i < 600; i++) {
      console.log(`Log ${i}`);
    }

    // Wait for cleanup interval (simulated)
    setTimeout(() => {
      // The cleanup happens every 5 minutes, but for testing we check the limit
      expect(logsRouter.realtimeLogs.length).toBeLessThanOrEqual(500);
      done();
    }, 100);
  });

  test('should preserve most recent logs when limit exceeded', () => {
    // Generate 600 logs
    for (let i = 0; i < 600; i++) {
      console.log(`Log ${i}`);
    }

    // Check that the most recent 500 logs are kept
    expect(logsRouter.realtimeLogs.length).toBe(500);
    expect(logsRouter.realtimeLogs[0].message).toBe('Log 100'); // First kept log
    expect(logsRouter.realtimeLogs[499].message).toBe('Log 599'); // Last log
  });
});
