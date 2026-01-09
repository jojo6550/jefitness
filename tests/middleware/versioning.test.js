/**
 * Unit tests for API Versioning Middleware
 * Tests version header handling and middleware functionality
 */
const versioning = require('../../src/middleware/versioning');

describe('Versioning Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };

    mockRes = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should set X-API-Version header to v1', () => {
    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(mockNext).toHaveBeenCalled();
  });

  test('should call next() to continue middleware chain', () => {
    versioning(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('should handle requests with existing API version headers', () => {
    mockReq.headers['x-api-version'] = 'v2';

    // Mock console.warn to avoid console output during tests
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Client using API version: v2, server supports: v1');
    expect(mockNext).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('should handle requests with correct API version headers', () => {
    mockReq.headers['x-api-version'] = 'v1';

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('should handle requests without API version headers', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('should handle case-insensitive API version headers', () => {
    mockReq.headers['X-API-VERSION'] = 'V2';

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Client using API version: V2, server supports: v1');
    expect(mockNext).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('should work with different header name variations', () => {
    mockReq.headers['x-api-version'] = 'v3';
    mockReq.headers['X-Api-Version'] = 'v4'; // This should be ignored

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    versioning(mockReq, mockRes, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('X-API-Version', 'v1');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Client using API version: v3, server supports: v1');
    expect(mockNext).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});
