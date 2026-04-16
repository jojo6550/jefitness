/**
 * HTTP Request Helper for Integration Tests
 *
 * Provides utilities for making HTTP requests to a running server
 */

const http = require('http');
const https = require('https');

class TestClient {
  constructor(baseUrl = process.env.API_BASE || 'http://localhost:10000') {
    this.baseUrl = baseUrl;
    this.apiPath = '/api/v1';
    this.token = null;
    this.cookies = {};
  }

  setToken(token) {
    this.token = token;
    return this;
  }

  setCookie(name, value) {
    this.cookies[name] = value;
    return this;
  }

  async request(method, path, body = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
      const fullPath = path.startsWith('http')
        ? path
        : `${this.baseUrl}${this.apiPath}${path}`;
      const url = new URL(fullPath);

      const headers = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };

      // Add authorization header if token is set
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      // Add cookies
      const cookieString = Object.entries(this.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      if (cookieString) {
        headers.Cookie = cookieString;
      }

      const options = {
        method,
        headers,
        timeout: 30000,
      };

      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsed,
              rawBody: data,
              cookies: this._parseCookies(res.headers['set-cookie']),
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: null,
              rawBody: data,
              error: e.message,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout to ${fullPath}`));
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  _parseCookies(setCookieHeader) {
    if (!setCookieHeader) return {};
    const cookies = {};
    (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]).forEach(
      cookie => {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
          cookies[name.trim()] = value.trim();
        }
      }
    );
    return cookies;
  }

  get(path, headers) {
    return this.request('GET', path, null, headers);
  }

  post(path, body, headers) {
    return this.request('POST', path, body, headers);
  }

  put(path, body, headers) {
    return this.request('PUT', path, body, headers);
  }

  patch(path, body, headers) {
    return this.request('PATCH', path, body, headers);
  }

  delete(path, headers) {
    return this.request('DELETE', path, null, headers);
  }

  // Convenience method to verify a response is OK
  expectStatus(response, expected) {
    const statusList = Array.isArray(expected) ? expected : [expected];
    if (!statusList.includes(response.status)) {
      throw new Error(
        `Expected status ${expected}, got ${response.status}: ${response.rawBody}`
      );
    }
    return response;
  }

  // Check if server is running
  async isServerReady() {
    try {
      const res = await this.get('/health');
      return res.status === 200;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { TestClient };
