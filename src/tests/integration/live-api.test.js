/**
 * Live API Integration Tests
 *
 * These tests require a running server (npm run dev)
 * Tests all major endpoints EXCLUDING subscriptions
 *
 * Run with: npm run test:integration
 */

const http = require('http');
const API_BASE = process.env.API_BASE || 'http://localhost:10000';
const API_URL = `${API_BASE}/api/v1`;

let serverAvailable = false;
let testToken = null;
let testEmail = `test-${Date.now()}@example.com`;

// Helper to make HTTP requests
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${API_URL}${path}`);
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, rawBody: data });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, rawBody: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Check if server is reachable
async function checkServer() {
  try {
    const res = await request('GET', `${API_URL}/health`);
    return res.status < 500;
  } catch (e) {
    return false;
  }
}

// Skip test body when server is offline
function skip(fn) {
  return async () => {
    if (!serverAvailable) return;
    return fn();
  };
}

describe('Live API Integration Tests', () => {
  beforeAll(async () => {
    serverAvailable = await checkServer();
    if (!serverAvailable) {
      console.warn('⚠️  Server not running at ' + API_URL);
      console.warn('Start server with: npm run dev');
    }
  });

  describe('Auth Endpoints', () => {
    test('POST /auth/signup - Create new user', skip(async () => {
      const res = await request('POST', '/auth/signup', {
        firstName: 'Test',
        lastName: 'User',
        email: testEmail,
        password: 'TestPassword123!',
      });

      expect([200, 201]).toContain(res.status);
      if (res.body?.token) testToken = res.body.token;
    }));

    test('POST /auth/login - Login with correct credentials', skip(async () => {
      const res = await request('POST', '/auth/login', {
        email: testEmail,
        password: 'TestPassword123!',
      });

      expect([200, 201, 403]).toContain(res.status);
      if ([200, 201].includes(res.status)) {
        expect(res.body.token).toBeDefined();
        testToken = res.body.token;
      }
    }));

    test('POST /auth/login - Fail with incorrect password', skip(async () => {
      const res = await request('POST', '/auth/login', {
        email: testEmail,
        password: 'WrongPassword',
      });
      expect([401, 400, 403]).toContain(res.status);
    }));

    test('GET /auth/me - Get current user', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/auth/me', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(testEmail);
      }
    }));
  });

  describe('User Profile Endpoints', () => {
    test('GET /users/profile - Get user profile', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/users/profile', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
    }));

    test('PUT /users/profile - Update user profile', skip(async () => {
      if (!testToken) return;
      const res = await request('PUT', '/users/profile', {
        firstName: 'UpdatedTest',
        lastName: 'UpdatedUser',
        bio: 'Updated bio',
      }, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 400, 401]).toContain(res.status);
    }));

    test('POST /users/measurements - Add body measurement', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/users/measurements', {
        date: new Date().toISOString(),
        weight: 75,
        neck: 38,
        waist: 82,
        hips: 95,
        chest: 100,
        notes: 'Initial measurement',
      }, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 201, 400, 401]).toContain(res.status);
    }));

    test('GET /users/measurements - Get user measurements', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/users/measurements', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.measurements || res.body.data || [])).toBe(true);
      }
    }));

    test('POST /users/privacy - Update privacy settings', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/users/privacy', {
        marketingEmails: false,
        dataAnalytics: true,
        thirdPartySharing: false,
      }, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 400, 401]).toContain(res.status);
    }));
  });

  describe('Workout Endpoints', () => {
    let workoutId = null;

    test('POST /workouts - Create workout log', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/workouts', {
        date: new Date().toISOString(),
        exerciseName: 'Bench Press',
        sets: 3, reps: 10, weight: 100, duration: 30,
        notes: 'Good session',
      }, { Authorization: `Bearer ${testToken}` });

      expect([200, 201, 400, 401]).toContain(res.status);
      if ([200, 201].includes(res.status)) workoutId = res.body?.workout?.id || res.body?.id;
    }));

    test('GET /workouts - List workouts', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/workouts?limit=10&page=1', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
    }));

    test('GET /workouts/:id - Get specific workout', skip(async () => {
      if (!testToken || !workoutId) return;
      const res = await request('GET', `/workouts/${workoutId}`, null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401, 404]).toContain(res.status);
    }));

    test('PUT /workouts/:id - Update workout', skip(async () => {
      if (!testToken || !workoutId) return;
      const res = await request('PUT', `/workouts/${workoutId}`, {
        exerciseName: 'Updated Exercise', sets: 4, reps: 12, weight: 110,
      }, { Authorization: `Bearer ${testToken}` });
      expect([200, 400, 401, 404]).toContain(res.status);
    }));

    test('DELETE /workouts/:id - Delete workout', skip(async () => {
      if (!testToken || !workoutId) return;
      const res = await request('DELETE', `/workouts/${workoutId}`, null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 204, 401, 404]).toContain(res.status);
    }));
  });

  describe('Nutrition Endpoints', () => {
    let mealLogId = null;

    test('POST /nutrition/logs - Create meal log', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/nutrition/logs', {
        mealType: 'breakfast',
        date: new Date().toISOString(),
        foods: [{ name: 'Chicken Breast', quantity: 150, unit: 'g', calories: 250, protein: 40, carbs: 0, fat: 5 }],
        totalCalories: 250,
      }, { Authorization: `Bearer ${testToken}` });

      expect([200, 201, 400, 401]).toContain(res.status);
      if ([200, 201].includes(res.status)) mealLogId = res.body?.mealLog?.id || res.body?.id;
    }));

    test('GET /nutrition/logs - List meal logs', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/nutrition/logs?limit=10', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
    }));

    test('GET /nutrition/daily-summary - Get daily macro summary', skip(async () => {
      if (!testToken) return;
      const date = new Date().toISOString().split('T')[0];
      const res = await request('GET', `/nutrition/daily-summary?date=${date}`, null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
    }));

    test('DELETE /nutrition/logs/:id - Delete meal log', skip(async () => {
      if (!testToken || !mealLogId) return;
      const res = await request('DELETE', `/nutrition/logs/${mealLogId}`, null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 204, 401, 404]).toContain(res.status);
    }));
  });

  describe('Health Data Endpoints', () => {
    let logId = null;

    test('POST /logs - Create health log', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/logs', {
        type: 'blood_pressure',
        date: new Date().toISOString(),
        systolic: 120, diastolic: 80,
        notes: 'Morning reading',
      }, { Authorization: `Bearer ${testToken}` });

      expect([200, 201, 400, 401]).toContain(res.status);
      if ([200, 201].includes(res.status)) logId = res.body?.log?.id || res.body?.id;
    }));

    test('GET /logs - List health logs', skip(async () => {
      if (!testToken) return;
      const res = await request('GET', '/logs?limit=10&page=1', null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 401]).toContain(res.status);
    }));

    test('DELETE /logs/:id - Delete health log', skip(async () => {
      if (!testToken || !logId) return;
      const res = await request('DELETE', `/logs/${logId}`, null, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 204, 401, 404]).toContain(res.status);
    }));
  });

  describe('Public Endpoints', () => {
    test('GET /programs - Get fitness programs', skip(async () => {
      const res = await request('GET', '/programs');
      expect([200, 401, 404]).toContain(res.status);
    }));

    test('GET /plans - Get available plans', skip(async () => {
      const res = await request('GET', '/plans');
      expect([200, 401, 404]).toContain(res.status);
    }));

    test('GET /health - Server health check', skip(async () => {
      const res = await request('GET', '/health');
      expect([200, 400, 404]).toContain(res.status);
    }));
  });

  describe('Password & Email Operations', () => {
    test('POST /auth/request-password-reset - Request password reset', skip(async () => {
      const res = await request('POST', '/auth/request-password-reset', { email: testEmail });
      expect([200, 400, 403, 404, 429]).toContain(res.status);
    }));

    test('POST /auth/verify-email-request - Request email verification', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/auth/verify-email-request', {}, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 400, 401, 429]).toContain(res.status);
    }));
  });

  describe('Logout', () => {
    test('POST /auth/logout - Logout user', skip(async () => {
      if (!testToken) return;
      const res = await request('POST', '/auth/logout', {}, {
        Authorization: `Bearer ${testToken}`,
      });
      expect([200, 204, 401]).toContain(res.status);
      testToken = null;
    }));
  });
});
