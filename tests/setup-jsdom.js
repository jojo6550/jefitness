// jsdom setup for frontend tests
const { JSDOM } = require('jsdom');

// Setup jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  contentType: 'text/html',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Set global window and document
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;
global.history = dom.window.history;
global.HTMLFormElement = dom.window.HTMLFormElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
};
global.sessionStorage = sessionStorageMock;

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Map()
  })
);

// Mock DOMParser
global.DOMParser = dom.window.DOMParser;

// Mock Image
global.Image = class {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.src = '';
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }
};

// Mock Audio
global.Audio = class {
  constructor() {
    this.play = jest.fn().mockResolvedValue();
    this.pause = jest.fn();
    this.load = jest.fn();
  }
};

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};

// Cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Reset localStorage mock
  Object.keys(localStorageMock).forEach(key => {
    if (typeof localStorageMock[key] === 'function') {
      localStorageMock[key].mockClear();
    }
  });

  // Reset sessionStorage mock
  Object.keys(sessionStorageMock).forEach(key => {
    if (typeof sessionStorageMock[key] === 'function') {
      sessionStorageMock[key].mockClear();
    }
  });

  // Reset fetch mock
  global.fetch.mockClear();

  // Clear document body
  document.body.innerHTML = '';
});
