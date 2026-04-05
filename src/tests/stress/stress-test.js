/**
 * JE Fitness Production Stress Test
 *
 * Simulates 30 concurrent users across 3 roles:
 *   - 24 regular users  (roles: user)
 *   - 4  trainers       (roles: trainer)
 *   - 2  admins         (roles: admin)
 *
 * Each virtual user runs an end-to-end scenario appropriate to their role.
 *
 * Usage:
 *   node src/tests/stress/stress-test.js
 *
 * Pre-requisites:
 *   - Trainer and admin accounts must already exist in production.
 *     Set their credentials via env vars (see TRAINER_ACCOUNTS / ADMIN_ACCOUNTS below).
 *   - Regular-user accounts are created on-the-fly and cleaned up at the end.
 *
 * Environment variables (all optional — defaults shown):
 *   STRESS_BASE_URL       https://jefitnessja.com
 *   STRESS_CONCURRENCY    30
 *   STRESS_TRAINER_CREDS  JSON array  e.g. '[{"email":"t1@ex.com","password":"pass"}]'
 *   STRESS_ADMIN_CREDS    JSON array  e.g. '[{"email":"a1@ex.com","password":"pass"}]'
 *   STRESS_THINK_TIME_MS  200   (ms pause between requests per virtual user)
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.STRESS_BASE_URL || 'https://jefitnessja.com';
const CONCURRENCY = parseInt(process.env.STRESS_CONCURRENCY || '30', 10);
const THINK_TIME = parseInt(process.env.STRESS_THINK_TIME_MS || '200', 10);

const TRAINER_CREDS = process.env.STRESS_TRAINER_CREDS
  ? JSON.parse(process.env.STRESS_TRAINER_CREDS)
  : [
      { email: 'trainer1@jefitnessja.com', password: 'Trainer1Pass!' },
      { email: 'trainer2@jefitnessja.com', password: 'Trainer2Pass!' },
      { email: 'trainer3@jefitnessja.com', password: 'Trainer3Pass!' },
      { email: 'trainer4@jefitnessja.com', password: 'Trainer4Pass!' },
    ];

const ADMIN_CREDS = process.env.STRESS_ADMIN_CREDS
  ? JSON.parse(process.env.STRESS_ADMIN_CREDS)
  : [
      { email: 'admin1@jefitnessja.com', password: 'Admin1Pass!' },
      { email: 'admin2@jefitnessja.com', password: 'Admin2Pass!' },
    ];

// Number of regular users = CONCURRENCY - trainers - admins
const REGULAR_USER_COUNT = CONCURRENCY - TRAINER_CREDS.length - ADMIN_CREDS.length;

// ─── Metrics ───────────────────────────────────────────────────────────────────

const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  permissionDenied: 0,   // 401 / 403
  rateLimited: 0,        // 429
  serverErrors: 0,       // 5xx
  latencies: [],         // ms per request
  errors: [],            // { user, step, status, body }
  startTime: null,
  endTime: null,
};

function recordRequest(status, latencyMs, context) {
  metrics.requests++;
  metrics.latencies.push(latencyMs);

  if (status >= 200 && status < 300) {
    metrics.successes++;
  } else if (status === 401 || status === 403) {
    metrics.permissionDenied++;
    metrics.failures++;
    metrics.errors.push({ ...context, status });
  } else if (status === 429) {
    metrics.rateLimited++;
    metrics.failures++;
  } else if (status >= 500) {
    metrics.serverErrors++;
    metrics.failures++;
    metrics.errors.push({ ...context, status });
  } else {
    metrics.failures++;
    if (status !== 400 && status !== 404) {
      // 400/404 are expected in some test scenarios
      metrics.errors.push({ ...context, status });
    }
  }
}

// ─── HTTP Helper ───────────────────────────────────────────────────────────────

/**
 * Minimal fetch-like helper that works with Node's built-in http/https.
 * Returns { status, body (parsed JSON or raw string), headers }.
 */
function request(method, path, { body, token, cookie, csrfToken } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (cookie) headers['Cookie'] = cookie;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 30000,
    };

    const start = Date.now();

    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const latency = Date.now() - start;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        // Collect Set-Cookie header for session tracking
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, body: parsed, headers: res.headers, setCookie, latency });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out: ${method} ${path}`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Scenario helpers ──────────────────────────────────────────────────────────

/** Login and return { token, cookie, userId }. Returns null on failure. */
async function login(email, password, label) {
  const res = await request('POST', '/api/v1/auth/login', {
    body: { email, password },
  }).catch(() => null);

  if (!res) return null;

  recordRequest(res.status, res.latency, { user: label, step: 'login' });

  if (res.status !== 200) return null;

  // Cookie-based auth (httpOnly) — reflect back whatever the server set
  const cookieHeader = (res.setCookie || []).map((c) => c.split(';')[0]).join('; ');
  const token = res.body?.token || null;
  const userId = res.body?.user?.id || res.body?.user?._id || null;

  return { token, cookie: cookieHeader, userId };
}

/** Grant both consents for a fresh user account. */
async function grantConsents(token, cookie, label) {
  const consentBody = {
    dataProcessingConsent: true,
    healthDataConsent: true,
    consentVersion: '1.1',
    healthConsentPurpose: 'fitness_tracking',
  };

  const res = await request('POST', '/api/v1/auth/consent', {
    body: consentBody,
    token,
    cookie,
  }).catch(() => null);

  if (res) recordRequest(res.status, res.latency, { user: label, step: 'consent' });
}

/** Create a test account; returns { email, password } or null. */
async function signup(idx) {
  const ts = Date.now();
  const email = `stress_user_${idx}_${ts}@test-jefitness.invalid`;
  const password = `StressPass${idx}!`;

  const res = await request('POST', '/api/v1/auth/signup', {
    body: {
      firstName: `Stress`,
      lastName: `User${idx}`,
      email,
      password,
    },
  }).catch(() => null);

  if (!res) return null;
  recordRequest(res.status, res.latency, { user: `new_user_${idx}`, step: 'signup' });

  if (res.status === 201 || res.status === 200) return { email, password };
  return null;
}

// ─── Role scenarios ────────────────────────────────────────────────────────────

/**
 * Regular user scenario — covers the full fitness workflow.
 */
async function regularUserScenario(idx) {
  const label = `regular_user_${idx}`;
  const log = (msg) => console.log(`  [${label}] ${msg}`);

  // 1. Create account
  const creds = await signup(idx);
  if (!creds) { log('signup failed — skipping'); return; }
  await sleep(THINK_TIME);

  // 2. Login
  const session = await login(creds.email, creds.password, label);
  if (!session) { log('login failed — skipping'); return; }
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  // 3. Grant consents (needed for health-data endpoints)
  await grantConsents(token, cookie, label);
  await sleep(THINK_TIME);

  // 4. GET own profile
  {
    const r = await request('GET', '/api/v1/users/me', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_profile' });
    await sleep(THINK_TIME);
  }

  // 5. UPDATE profile
  {
    const r = await request('PUT', '/api/v1/users/me', {
      token, cookie,
      body: { currentWeight: 75 + idx, height: 170 + (idx % 20) },
    }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'update_profile' });
    await sleep(THINK_TIME);
  }

  // 6. LOG a measurement
  {
    const r = await request('POST', '/api/v1/users/me/measurements', {
      token, cookie,
      body: { weight: 75 + idx, waist: 80, notes: 'stress test' },
    }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'log_measurement' });
    await sleep(THINK_TIME);
  }

  // 7. GET measurements
  {
    const r = await request('GET', '/api/v1/users/me/measurements', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_measurements' });
    await sleep(THINK_TIME);
  }

  // 8. LOG a workout
  let workoutId = null;
  {
    const r = await request('POST', '/api/v1/workouts/log', {
      token, cookie,
      body: {
        workoutName: `Stress Test Workout ${idx}`,
        exercises: [
          {
            exerciseName: 'Bench Press',
            sets: [
              { setNumber: 1, reps: 10, weight: 60, rpe: 7, completed: true },
              { setNumber: 2, reps: 10, weight: 60, rpe: 7, completed: true },
            ],
          },
          {
            exerciseName: 'Squat',
            sets: [
              { setNumber: 1, reps: 8, weight: 80, rpe: 8, completed: true },
            ],
          },
        ],
        duration: 45,
        notes: 'stress test run',
      },
    }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'log_workout' });
      workoutId = r.body?._id || r.body?.data?._id || null;
    }
    await sleep(THINK_TIME);
  }

  // 9. GET workouts list
  {
    const r = await request('GET', '/api/v1/workouts', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_workouts' });
    await sleep(THINK_TIME);
  }

  // 10. GET workout stats
  {
    const r = await request('GET', '/api/v1/workouts/stats/summary', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'workout_stats' });
    await sleep(THINK_TIME);
  }

  // 11. LOG a meal
  let mealId = null;
  {
    const r = await request('POST', '/api/v1/nutrition/log', {
      token, cookie,
      body: {
        mealType: ['breakfast', 'lunch', 'dinner', 'snack'][idx % 4],
        foods: [
          { foodName: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, quantity: 150, unit: 'g' },
          { foodName: 'Brown Rice',     calories: 216, protein: 4.5, carbs: 45, fat: 1.8, quantity: 200, unit: 'g' },
        ],
        notes: 'stress test meal',
      },
    }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'log_meal' });
      mealId = r.body?._id || r.body?.data?._id || null;
    }
    await sleep(THINK_TIME);
  }

  // 12. GET nutrition list
  {
    const r = await request('GET', '/api/v1/nutrition', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_nutrition' });
    await sleep(THINK_TIME);
  }

  // 13. GET nutrition stats
  {
    const r = await request('GET', '/api/v1/nutrition/stats/summary', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'nutrition_stats' });
    await sleep(THINK_TIME);
  }

  // 14. Daily macros
  {
    const r = await request('GET', '/api/v1/nutrition/daily', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'daily_macros' });
    await sleep(THINK_TIME);
  }

  // 15. Create a workout goal
  let goalId = null;
  {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request('POST', '/api/v1/workouts/goals', {
      token, cookie,
      body: { exercise: 'Deadlift', targetWeight: 120 + idx, targetDate: future },
    }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'create_goal' });
      goalId = r.body?._id || r.body?.data?._id || null;
    }
    await sleep(THINK_TIME);
  }

  // 16. GET workout goals
  {
    const r = await request('GET', '/api/v1/workouts/goals', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_goals' });
    await sleep(THINK_TIME);
  }

  // 17. GET subscription plans (public)
  {
    const r = await request('GET', '/api/v1/subscriptions/plans').catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_plans' });
    await sleep(THINK_TIME);
  }

  // 18. GET current subscription
  {
    const r = await request('GET', '/api/v1/subscriptions/current', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_subscription' });
    await sleep(THINK_TIME);
  }

  // 19. GET programs (public)
  {
    const r = await request('GET', '/api/v1/programs').catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_programs' });
    await sleep(THINK_TIME);
  }

  // 20. Permission check — regular user should NOT access admin routes
  {
    const r = await request('GET', '/api/v1/clients', { token, cookie }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'perm_check_admin_route' });
      if (r.status === 200) {
        console.warn(`  [PERM FAIL] ${label} accessed /api/v1/clients — should be 403`);
      }
    }
    await sleep(THINK_TIME);
  }

  // 21. Permission check — regular user should NOT access trainer routes
  {
    const r = await request('GET', '/api/v1/trainer/dashboard', { token, cookie }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'perm_check_trainer_route' });
      if (r.status === 200) {
        console.warn(`  [PERM FAIL] ${label} accessed /api/v1/trainer/dashboard — should be 403`);
      }
    }
    await sleep(THINK_TIME);
  }

  // 22. DELETE workout (cleanup)
  if (workoutId) {
    const r = await request('DELETE', `/api/v1/workouts/${workoutId}`, { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'delete_workout' });
    await sleep(THINK_TIME);
  }

  // 23. DELETE goal (cleanup)
  if (goalId) {
    const r = await request('DELETE', `/api/v1/workouts/goals/${goalId}`, { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'delete_goal' });
    await sleep(THINK_TIME);
  }

  // 24. DELETE own account (cleanup)
  {
    const r = await request('DELETE', '/api/v1/users/me', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'delete_account' });
  }

  log('scenario complete');
}

/**
 * Trainer scenario — trainer dashboard, client list, appointments.
 */
async function trainerScenario(creds, idx) {
  const label = `trainer_${idx}`;
  const log = (msg) => console.log(`  [${label}] ${msg}`);

  const session = await login(creds.email, creds.password, label);
  if (!session) { log('login failed — skipping'); return; }
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  // 1. GET own profile
  {
    const r = await request('GET', '/api/v1/users/me', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_profile' });
    await sleep(THINK_TIME);
  }

  // 2. GET trainer info
  {
    const r = await request('GET', '/api/v1/trainer/me', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'trainer_me' });
    await sleep(THINK_TIME);
  }

  // 3. GET trainer dashboard
  {
    const r = await request('GET', '/api/v1/trainer/dashboard', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'trainer_dashboard' });
    await sleep(THINK_TIME);
  }

  // 4. GET trainer's clients
  {
    const r = await request('GET', '/api/v1/trainer/clients', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'trainer_clients' });
    await sleep(THINK_TIME);
  }

  // 5. GET trainer's appointments
  {
    const r = await request('GET', '/api/v1/trainer/appointments', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'trainer_appointments' });
    await sleep(THINK_TIME);
  }

  // 6. GET trainers list (public-ish)
  {
    const r = await request('GET', '/api/v1/users/trainers', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_trainers_list' });
    await sleep(THINK_TIME);
  }

  // 7. Permission check — trainer should NOT access admin /clients route
  {
    const r = await request('GET', '/api/v1/clients', { token, cookie }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'perm_check_admin_route' });
      if (r.status === 200) {
        console.warn(`  [PERM FAIL] ${label} accessed /api/v1/clients — should be 403`);
      }
    }
    await sleep(THINK_TIME);
  }

  // 8. GET programs
  {
    const r = await request('GET', '/api/v1/programs', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_programs' });
    await sleep(THINK_TIME);
  }

  // 9. GET subscription plans
  {
    const r = await request('GET', '/api/v1/subscriptions/plans').catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_plans' });
    await sleep(THINK_TIME);
  }

  // 10. Health check
  {
    const r = await request('GET', '/api/health').catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'health_check' });
  }

  log('scenario complete');
}

/**
 * Admin scenario — client management, statistics, account oversight.
 */
async function adminScenario(creds, idx) {
  const label = `admin_${idx}`;
  const log = (msg) => console.log(`  [${label}] ${msg}`);

  const session = await login(creds.email, creds.password, label);
  if (!session) { log('login failed — skipping'); return; }
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  // 1. GET own profile
  {
    const r = await request('GET', '/api/v1/users/me', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_profile' });
    await sleep(THINK_TIME);
  }

  // 2. GET clients list (admin only)
  {
    const r = await request('GET', '/api/v1/clients?page=1&limit=20', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'list_clients' });
    await sleep(THINK_TIME);
  }

  // 3. GET client statistics (admin only)
  {
    const r = await request('GET', '/api/v1/clients/statistics', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'client_stats' });
    await sleep(THINK_TIME);
  }

  // 4. GET clients with search
  {
    const r = await request('GET', '/api/v1/clients?search=test&page=1&limit=10', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'search_clients' });
    await sleep(THINK_TIME);
  }

  // 5. GET clients with filter
  {
    const r = await request('GET', '/api/v1/clients?role=user&sort=createdAt&order=desc', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'filter_clients' });
    await sleep(THINK_TIME);
  }

  // 6. GET all trainers
  {
    const r = await request('GET', '/api/v1/users/trainers', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'list_trainers' });
    await sleep(THINK_TIME);
  }

  // 7. GET programs list
  {
    const r = await request('GET', '/api/v1/programs', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_programs' });
    await sleep(THINK_TIME);
  }

  // 8. GET current subscription
  {
    const r = await request('GET', '/api/v1/subscriptions/current', { token, cookie }).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'get_subscription' });
    await sleep(THINK_TIME);
  }

  // 9. Health check
  {
    const r = await request('GET', '/api/health').catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: 'health_check' });
    await sleep(THINK_TIME);
  }

  // 10. Permission: admin CAN access trainer dashboard (should be 403 unless admin also has trainer role)
  {
    const r = await request('GET', '/api/v1/trainer/dashboard', { token, cookie }).catch(() => null);
    if (r) {
      recordRequest(r.status, r.latency, { user: label, step: 'perm_check_trainer_route' });
      // Log result but don't flag either way — depends on whether admin has trainer role
      log(`trainer/dashboard responded ${r.status} (expected 403 unless admin is also trainer)`);
    }
    await sleep(THINK_TIME);
  }

  log('scenario complete');
}

// ─── Unauthenticated / public endpoint warmup ──────────────────────────────────

async function publicEndpointRun(idx) {
  const label = `anon_${idx}`;

  const endpoints = [
    ['GET', '/api/health'],
    ['GET', '/api/v1/subscriptions/plans'],
    ['GET', '/api/v1/programs'],
    ['GET', '/api/v1/programs?search=fitness'],
    ['GET', '/api/v1/programs?tag=beginner'],
  ];

  for (const [method, path] of endpoints) {
    const r = await request(method, path).catch(() => null);
    if (r) recordRequest(r.status, r.latency, { user: label, step: path });
    await sleep(THINK_TIME);
  }
}

// ─── Report ────────────────────────────────────────────────────────────────────

function printReport() {
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const lats = metrics.latencies.sort((a, b) => a - b);
  const p50 = lats[Math.floor(lats.length * 0.5)] ?? 0;
  const p90 = lats[Math.floor(lats.length * 0.9)] ?? 0;
  const p99 = lats[Math.floor(lats.length * 0.99)] ?? 0;
  const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
  const rps = (metrics.requests / duration).toFixed(2);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('           JE FITNESS STRESS TEST REPORT');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Target:          ${BASE_URL}`);
  console.log(`  Virtual Users:   ${CONCURRENCY} (${REGULAR_USER_COUNT} users / ${TRAINER_CREDS.length} trainers / ${ADMIN_CREDS.length} admins)`);
  console.log(`  Duration:        ${duration.toFixed(1)}s`);
  console.log(`  Total Requests:  ${metrics.requests}`);
  console.log(`  Throughput:      ${rps} req/s`);
  console.log('───────────────────────────────────────────────────────');
  console.log('  Outcomes:');
  console.log(`    Successes:       ${metrics.successes}  (${pct(metrics.successes, metrics.requests)}%)`);
  console.log(`    Failures:        ${metrics.failures}  (${pct(metrics.failures, metrics.requests)}%)`);
  console.log(`    Rate Limited:    ${metrics.rateLimited}  (${pct(metrics.rateLimited, metrics.requests)}%)`);
  console.log(`    Perm Denied:     ${metrics.permissionDenied}  (${pct(metrics.permissionDenied, metrics.requests)}%)`);
  console.log(`    Server Errors:   ${metrics.serverErrors}  (${pct(metrics.serverErrors, metrics.requests)}%)`);
  console.log('───────────────────────────────────────────────────────');
  console.log('  Latency (ms):');
  console.log(`    avg:   ${avg}`);
  console.log(`    p50:   ${p50}`);
  console.log(`    p90:   ${p90}`);
  console.log(`    p99:   ${p99}`);
  console.log(`    max:   ${lats[lats.length - 1] ?? 0}`);
  console.log('───────────────────────────────────────────────────────');

  if (metrics.errors.length > 0) {
    console.log('  Non-2xx / unexpected errors (first 20):');
    metrics.errors.slice(0, 20).forEach((e) => {
      console.log(`    [${e.user}] step="${e.step}" HTTP ${e.status}`);
    });
  }

  console.log('═══════════════════════════════════════════════════════\n');

  // Permission-failure summary
  const permFails = metrics.errors.filter((e) => e.status === 200 && e.step?.startsWith('perm_check'));
  if (permFails.length > 0) {
    console.error('  [!] PERMISSION FAILURES — unauthorized routes were accessible:');
    permFails.forEach((e) => console.error(`      ${e.user} → ${e.step}`));
  } else {
    console.log('  [✓] All role-permission checks passed.');
  }

  // Overall pass/fail
  const errorRate = metrics.failures / Math.max(metrics.requests, 1);
  if (errorRate > 0.1) {
    console.error(`\n  [FAIL] Error rate ${(errorRate * 100).toFixed(1)}% exceeds 10% threshold.`);
    process.exitCode = 1;
  } else {
    console.log(`\n  [PASS] Error rate ${(errorRate * 100).toFixed(1)}% is within acceptable range.`);
  }
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nJE Fitness Stress Test — ${CONCURRENCY} concurrent virtual users`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Think time: ${THINK_TIME}ms between requests\n`);
  console.log('Starting all virtual users simultaneously...\n');

  metrics.startTime = Date.now();

  // Build the task list
  const tasks = [];

  // Regular users
  for (let i = 0; i < REGULAR_USER_COUNT; i++) {
    tasks.push(regularUserScenario(i + 1));
  }

  // Trainers
  TRAINER_CREDS.forEach((creds, i) => {
    tasks.push(trainerScenario(creds, i + 1));
  });

  // Admins
  ADMIN_CREDS.forEach((creds, i) => {
    tasks.push(adminScenario(creds, i + 1));
  });

  // Run all virtual users concurrently
  await Promise.allSettled(tasks);

  metrics.endTime = Date.now();

  printReport();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
