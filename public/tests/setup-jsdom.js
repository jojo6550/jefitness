// Frontend test setup file (jsdom environment)
// This file runs before all frontend tests

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock fetch API
global.fetch = jest.fn();

// Mock Bootstrap Toast
global.bootstrap = {
  Toast: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
  Modal: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
};

// Mock window.ApiConfig
global.window.ApiConfig = {
  getAPI_BASE: jest.fn(() => 'http://localhost:5500/api'),
};

// Reset mocks after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});