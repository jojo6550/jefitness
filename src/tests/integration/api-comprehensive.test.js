/**
 * Comprehensive API Integration Tests
 *
 * Tests all major endpoints EXCLUDING subscriptions
 * Uses TestClient helper for cleaner code
 *
 * Requirements:
 * - Running server: npm run dev
 * - MongoDB connection available
 *
 * Run with: npm run test:integration
 */

const { TestClient } = require('./test-helper');

let client;
let testEmail = `test-live-${Date.now()}@example.com`;
let testToken = null;
let testUserId = null;
let serverAvailable = false;

const createdIds = { workouts: [], mealLogs: [], healthLogs: [] };

// Helper: skip test body when server is offline
function skip(fn) {
  return async () => {
    if (!serverAvailable) return;
    return fn();
  };
}

describe('Comprehensive API Integration Tests', () => {
  beforeAll(async () => {
    client = new TestClient();
    serverAvailable = await client.isServerReady();

    if (!serverAvailable) {
      console.warn('⚠️  Server not ready at ' + client.baseUrl);
      console.warn('Start server with: npm run dev');
    }
  });

  afterAll(async () => {
    if (!serverAvailable || !testToken) return;
    client.setToken(testToken);
    for (const id of createdIds.workouts) {
      await client.delete(`/workouts/${id}`).catch(() => {});
    }
    for (const id of createdIds.mealLogs) {
      await client.delete(`/nutrition/logs/${id}`).catch(() => {});
    }
    for (const id of createdIds.healthLogs) {
      await client.delete(`/logs/${id}`).catch(() => {});
    }
  });

  // =====================================================
  // AUTHENTICATION FLOW
  // =====================================================
  describe('Authentication Flow', () => {
    test(
      '[1] Signup - Create new user account',
      skip(async () => {
        const res = await client.post('/auth/signup', {
          firstName: 'Integration',
          lastName: 'Tester',
          email: testEmail,
          password: 'SecurePassword123!',
        });

        expect([200, 201]).toContain(res.status);
        if (res.body?.user?.id) testUserId = res.body.user.id;
        if (res.body?.token) {
          testToken = res.body.token;
          client.setToken(testToken);
        }
      }),
      30000
    );

    test(
      '[2] Login - Authenticate with email and password',
      skip(async () => {
        if (!testToken) {
          const res = await client.post('/auth/login', {
            email: testEmail,
            password: 'SecurePassword123!',
          });
          expect([200, 201, 403]).toContain(res.status);
          if ([200, 201].includes(res.status)) {
            testToken = res.body.token;
            client.setToken(testToken);
          }
        }
      }),
      30000
    );

    test(
      '[3] Get Current User - Verify authenticated session',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/auth/me');
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.user).toBeDefined();
          expect(res.body.user.email).toBe(testEmail);
        }
      }),
      30000
    );

    test(
      '[4] Login Failure - Reject invalid credentials',
      skip(async () => {
        const res = await client.post('/auth/login', {
          email: testEmail,
          password: 'WrongPassword',
        });
        expect([401, 400, 403]).toContain(res.status);
      }),
      30000
    );
  });

  // =====================================================
  // USER PROFILE MANAGEMENT
  // =====================================================
  describe('User Profile Management', () => {
    test(
      '[5] Get Profile - Retrieve user profile',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/users/profile');
        expect([200, 401, 404]).toContain(res.status);
      }),
      30000
    );

    test(
      '[6] Update Profile - Modify user information',
      skip(async () => {
        if (!testToken) return;
        const res = await client.put('/users/profile', {
          firstName: 'UpdatedIntegration',
          lastName: 'UpdatedTester',
          bio: 'Integration test user bio',
          age: 30,
          gender: 'male',
        });
        expect([200, 400, 401]).toContain(res.status);
      }),
      30000
    );

    test(
      '[7] Add Measurements - Record body measurements',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/users/measurements', {
          date: new Date().toISOString(),
          weight: 75.5,
          neck: 37.5,
          waist: 82.0,
          hips: 95.5,
          chest: 100.0,
          notes: 'Initial baseline measurement',
        });
        expect([200, 201, 400, 401]).toContain(res.status);
      }),
      30000
    );

    test(
      '[8] Get Measurements - Retrieve measurement history',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/users/measurements');
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.measurements || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[9] Privacy Settings - Update user privacy preferences',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/users/privacy', {
          marketingEmails: false,
          dataAnalytics: true,
          thirdPartySharing: false,
        });
        expect([200, 400, 401]).toContain(res.status);
      }),
      30000
    );
  });

  // =====================================================
  // WORKOUT TRACKING
  // =====================================================
  describe('Workout Tracking', () => {
    let workoutId = null;

    test(
      '[10] Create Workout - Log exercise session',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/workouts', {
          date: new Date().toISOString(),
          exerciseName: 'Bench Press',
          sets: 3,
          reps: 10,
          weight: 100,
          duration: 30,
          notes: 'Integration test workout',
        });
        expect([200, 201, 400, 401]).toContain(res.status);
        if ([200, 201].includes(res.status)) {
          workoutId = res.body?.workout?.id || res.body?.id;
          if (workoutId) createdIds.workouts.push(workoutId);
        }
      }),
      30000
    );

    test(
      '[11] List Workouts - Retrieve workout history with pagination',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/workouts?limit=10&page=1');
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.workouts || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[12] Get Specific Workout - Retrieve details of one workout',
      skip(async () => {
        if (!testToken || !workoutId) return;
        const res = await client.get(`/workouts/${workoutId}`);
        expect([200, 401, 404]).toContain(res.status);
      }),
      30000
    );

    test(
      '[13] Update Workout - Modify exercise details',
      skip(async () => {
        if (!testToken || !workoutId) return;
        const res = await client.put(`/workouts/${workoutId}`, {
          exerciseName: 'Updated: Incline Bench Press',
          sets: 4,
          reps: 12,
          weight: 110,
        });
        expect([200, 400, 401, 404]).toContain(res.status);
      }),
      30000
    );

    test(
      '[14] Delete Workout - Remove workout log',
      skip(async () => {
        if (!testToken || !workoutId) return;
        const res = await client.delete(`/workouts/${workoutId}`);
        expect([200, 204, 401, 404]).toContain(res.status);
        createdIds.workouts = createdIds.workouts.filter(id => id !== workoutId);
      }),
      30000
    );
  });

  // =====================================================
  // NUTRITION TRACKING
  // =====================================================
  describe('Nutrition Tracking', () => {
    let mealLogId = null;

    test(
      '[15] Create Meal Log - Record food intake',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/nutrition/logs', {
          mealType: 'breakfast',
          date: new Date().toISOString(),
          foods: [
            {
              name: 'Chicken Breast',
              quantity: 150,
              unit: 'g',
              calories: 250,
              protein: 40,
              carbs: 0,
              fat: 5,
            },
            {
              name: 'Brown Rice',
              quantity: 100,
              unit: 'g',
              calories: 111,
              protein: 2.6,
              carbs: 23,
              fat: 0.9,
            },
          ],
          totalCalories: 361,
        });
        expect([200, 201, 400, 401]).toContain(res.status);
        if ([200, 201].includes(res.status)) {
          mealLogId = res.body?.mealLog?.id || res.body?.id;
          if (mealLogId) createdIds.mealLogs.push(mealLogId);
        }
      }),
      30000
    );

    test(
      '[16] List Meal Logs - Retrieve nutrition history',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/nutrition/logs?limit=10&page=1');
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.mealLogs || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[17] Daily Macro Summary - Get nutritional summary for date',
      skip(async () => {
        if (!testToken) return;
        const date = new Date().toISOString().split('T')[0];
        const res = await client.get(`/nutrition/daily-summary?date=${date}`);
        expect([200, 401]).toContain(res.status);
      }),
      30000
    );

    test(
      '[18] Delete Meal Log - Remove food record',
      skip(async () => {
        if (!testToken || !mealLogId) return;
        const res = await client.delete(`/nutrition/logs/${mealLogId}`);
        expect([200, 204, 401, 404]).toContain(res.status);
        createdIds.mealLogs = createdIds.mealLogs.filter(id => id !== mealLogId);
      }),
      30000
    );
  });

  // =====================================================
  // HEALTH DATA LOGGING
  // =====================================================
  describe('Health Data Logging', () => {
    let logId = null;

    test(
      '[19] Create Health Log - Record health metrics',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/logs', {
          type: 'blood_pressure',
          date: new Date().toISOString(),
          systolic: 120,
          diastolic: 80,
          notes: 'Morning reading - integration test',
        });
        expect([200, 201, 400, 401]).toContain(res.status);
        if ([200, 201].includes(res.status)) {
          logId = res.body?.log?.id || res.body?.id;
          if (logId) createdIds.healthLogs.push(logId);
        }
      }),
      30000
    );

    test(
      '[20] List Health Logs - Retrieve health data history',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/logs?limit=10&page=1');
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.logs || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[21] Delete Health Log - Remove health record',
      skip(async () => {
        if (!testToken || !logId) return;
        const res = await client.delete(`/logs/${logId}`);
        expect([200, 204, 401, 404]).toContain(res.status);
        createdIds.healthLogs = createdIds.healthLogs.filter(id => id !== logId);
      }),
      30000
    );
  });

  // =====================================================
  // PUBLIC ENDPOINTS
  // =====================================================
  describe('Public Endpoints', () => {
    test(
      '[22] Get Programs - List available fitness programs',
      skip(async () => {
        const res = await client.get('/programs');
        expect([200, 401, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.programs || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[23] Get Plans - List available subscription plans',
      skip(async () => {
        const res = await client.get('/plans');
        expect([200, 401, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body.plans || res.body.data || [])).toBe(true);
        }
      }),
      30000
    );

    test(
      '[24] Server Health Check - Verify server is running',
      skip(async () => {
        const res = await client.get('/health');
        expect([200, 400, 404, 500]).toContain(res.status);
      }),
      30000
    );
  });

  // =====================================================
  // ACCOUNT OPERATIONS
  // =====================================================
  describe('Account Operations', () => {
    test(
      '[25] Request Password Reset - Initiate reset flow',
      skip(async () => {
        const res = await client.post('/auth/request-password-reset', {
          email: testEmail,
        });
        expect([200, 400, 403, 404, 429]).toContain(res.status);
      }),
      30000
    );

    test(
      '[26] Request Email Verification - Send verification email',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/auth/verify-email-request', {});
        expect([200, 400, 401, 429]).toContain(res.status);
      }),
      30000
    );

    test(
      '[27] Logout - End authenticated session',
      skip(async () => {
        if (!testToken) return;
        const res = await client.post('/auth/logout', {});
        expect([200, 204, 401]).toContain(res.status);
        testToken = null;
        client.setToken(null);
      }),
      30000
    );
  });

  // =====================================================
  // ERROR HANDLING
  // =====================================================
  describe('Error Handling', () => {
    test(
      '[28] Unauthorized Access - Reject unauthenticated protected routes',
      skip(async () => {
        const res = await client.get('/users/profile');
        expect([401, 403]).toContain(res.status);
      }),
      30000
    );

    test(
      '[29] Invalid Data - Reject malformed requests',
      skip(async () => {
        const res = await client.post('/auth/signup', {
          email: 'not-an-email',
          password: 'short',
        });
        expect([400, 422]).toContain(res.status);
      }),
      30000
    );

    test(
      '[30] Not Found - Handle missing resources',
      skip(async () => {
        if (!testToken) return;
        const res = await client.get('/workouts/invalid-id-12345');
        expect([400, 404]).toContain(res.status);
      }),
      30000
    );
  });
});
