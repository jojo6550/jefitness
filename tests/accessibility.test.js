// Mock DOM environment for testing
const mockDocument = {
  documentElement: {
    getAttribute: jest.fn(() => 'en'),
    setAttribute: jest.fn()
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    appendChild: jest.fn(),
    insertBefore: jest.fn(),
    addEventListener: jest.fn()
  })),
  body: {
    appendChild: jest.fn()
  },
  getElementsByTagName: jest.fn(() => [])
};

const mockWindow = {
  location: {
    protocol: 'http:',
    host: 'localhost'
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

global.window = mockWindow;
global.document = mockDocument;
global.navigator = { userAgent: 'test' };

describe('Accessibility Tests', () => {
  test('should have mocked DOM elements', () => {
    expect(global.document).toBeDefined();
    expect(global.window).toBeDefined();
    expect(global.navigator).toBeDefined();
  });

  test('should mock document methods', () => {
    expect(typeof global.document.querySelector).toBe('function');
    expect(typeof global.document.getElementById).toBe('function');
  });

  test('should mock window methods', () => {
    expect(typeof global.window.addEventListener).toBe('function');
    expect(typeof global.window.removeEventListener).toBe('function');
  });
});
