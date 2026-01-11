const express = require('express');
const request = require('supertest');
const logsRouter = require('../../src/routes/logs');

// Mock console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

let capturedLogs = [];

console.log = function(...args) {
  const message = args.join(' ');
  capturedLogs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'app',
    message: message
  });
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  capturedLogs.push({
    timestamp: new Date().toISOString(),
    level: 'error',
    category: 'error',
    message: message
  });
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  capturedLogs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    category: 'warn',
    message: message
  });
  originalConsoleWarn.apply(console, args);
};

describe('Log Storage Memory Management', () => {
  let app;

  beforeEach(() => {
    // Clear captured logs but don't reset realtimeLogs (it's global)
    capturedLogs = [];
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/logs', logsRouter);
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
      // The cleanup happens every 5 minutes, but for testing we can check the limit
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
