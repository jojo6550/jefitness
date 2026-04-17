const fs = require('fs');
const path = require('path');

function loadApiConfig() {
  // Reset window assignments before each load
  delete window.ApiConfig;
  delete window.API;
  delete window.API_BASE;
  const code = fs.readFileSync(path.resolve(__dirname, '../../js/api.config.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', code)(global.window);
}

beforeEach(() => {
  loadApiConfig();
});

describe('window.ApiConfig', () => {
  it('is defined after loading', () => {
    expect(window.ApiConfig).toBeDefined();
  });

  it('getAPI_BASE() returns the window origin', () => {
    // jsdom default origin is 'http://localhost'
    expect(window.ApiConfig.getAPI_BASE()).toBe(window.location.origin);
  });

  it('getDebugInfo() returns object with base, hostname, isProduction', () => {
    const info = window.ApiConfig.getDebugInfo();
    expect(info).toHaveProperty('base', window.location.origin);
    expect(info).toHaveProperty('hostname', 'localhost');
    expect(info).toHaveProperty('isProduction', false);
  });

  it('isProduction is false for http protocol', () => {
    expect(window.ApiConfig.getDebugInfo().isProduction).toBe(false);
  });
});

describe('window.API_BASE', () => {
  it('equals getAPI_BASE() for backward compat', () => {
    expect(window.API_BASE).toBe(window.ApiConfig.getAPI_BASE());
  });
});

describe('window.API.request', () => {
  it('calls fetch with full URL prepended by API_BASE', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: 'ok' }),
    });

    await window.API.request('/api/v1/auth/me');

    const [calledUrl, calledOptions] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe(`${window.location.origin}/api/v1/auth/me`);
    expect(calledOptions.headers['Content-Type']).toBe('application/json');
  });

  it('returns parsed JSON on successful response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ user: { id: '123' } }),
    });

    const result = await window.API.request('/api/v1/auth/me');

    expect(result).toEqual({ user: { id: '123' } });
  });

  it('throws error with status on non-ok response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: jest.fn().mockResolvedValue({ message: 'Not authenticated' }),
    });

    await expect(window.API.request('/api/v1/auth/me')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws "Backend unavailable" on network TypeError', async () => {
    const networkError = new TypeError('Failed to fetch');
    global.fetch.mockRejectedValue(networkError);

    await expect(window.API.request('/api/v1/auth/me')).rejects.toThrow('Backend unavailable');
  });

  it('passes through custom headers', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    });

    await window.API.request('/test', { headers: { 'X-Custom': 'value' } });

    const callHeaders = global.fetch.mock.calls[0][1].headers;
    expect(callHeaders['X-Custom']).toBe('value');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });
});

describe('window.API.auth', () => {
  beforeEach(() => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });
  });

  it('login calls POST /api/v1/auth/login', async () => {
    await window.API.auth.login('user@test.com', 'password');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/login');
    expect(options.method).toBe('POST');
  });

  it('logout calls POST /api/v1/auth/logout', async () => {
    await window.API.auth.logout();

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/logout');
    expect(options.method).toBe('POST');
  });

  it('register delegates to signup', async () => {
    const data = { email: 'new@test.com', password: 'test1234' };
    await window.API.auth.register(data);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/signup');
  });
});

describe('window.API token stubs', () => {
  it('getToken returns null', () => {
    expect(window.API.getToken()).toBeNull();
  });

  it('setToken does not throw', () => {
    expect(() => window.API.setToken('sometoken')).not.toThrow();
  });

  it('clearToken does not throw', () => {
    expect(() => window.API.clearToken()).not.toThrow();
  });
});
