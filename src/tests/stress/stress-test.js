/**
 * JE Fitness Production Stress Test
 *
 * Simulates 30 concurrent users across 3 roles:
 *   - 24 regular users  (role: user)
 *   - 4  trainers       (role: trainer)
 *   - 2  admins         (role: admin)
 *
 * Usage:
 *   node src/tests/stress/stress-test.js
 *
 * Environment variables (all optional — defaults shown):
 *   STRESS_BASE_URL       https://jefitnessja.com
 *   STRESS_CONCURRENCY    30
 *   STRESS_TRAINER_CREDS  JSON array  '[{"email":"t@ex.com","password":"pass"}]'
 *   STRESS_ADMIN_CREDS    JSON array  '[{"email":"a@ex.com","password":"pass"}]'
 *   STRESS_THINK_TIME_MS  200
 *   STRESS_VERBOSE        1   (print every request attempt + raw response)
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:10000';
const CONCURRENCY = parseInt('30', 10);
const THINK_TIME = parseInt( '200', 10);
const VERBOSE = '1';

const BYPASS_MODE = 'true';

if (BYPASS_MODE) {
  console.log('\n🚀 STRESS BYPASS MODE ENABLED - Email verification auto-bypassed\n');
} else {
  console.log('\nℹ️  Normal mode - Email verification required (expect login failures)\n');
}

// Use a real-looking domain so express-validator's isEmail() accepts it.
// These accounts are created and deleted within the test run.
const TEST_EMAIL_DOMAIN = 'mailtest.jefitnessja.com';

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

const REGULAR_USER_COUNT = CONCURRENCY - TRAINER_CREDS.length - ADMIN_CREDS.length;

// ─── Metrics ───────────────────────────────────────────────────────────────────

const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  permissionDenied: 0,
  rateLimited: 0,
  serverErrors: 0,
  networkErrors: 0,
  latencies: [],
  errors: [],
  permFailures: [],
  startTime: null,
  endTime: null,
};

function recordRequest(status, latencyMs, context) {
  metrics.requests++;
  metrics.latencies.push(latencyMs);

  if (VERBOSE) {
    console.log(`    [${context.user}/${context.step}] HTTP ${status} (${latencyMs}ms)`);
  }

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
    // 400/404 may be expected in some probes — still record
    metrics.errors.push({ ...context, status });
  }
}

function recordNetworkError(err, context) {
  metrics.requests++;
  metrics.networkErrors++;
  metrics.failures++;
  console.error(`    [NET ERR] ${context.user}/${context.step}: ${err.message}`);
}

// ─── HTTP Helper ───────────────────────────────────────────────────────────────

/**
 * Thin Node-native HTTP client.
 * Returns { status, body, headers, setCookie, latency }.
 * Throws on network-level errors (timeout, connection refused, etc.).
 */
function request(method, path, { body, token, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Consistent UA so CSRF token validation (keyed on UA) is stable
      'User-Agent': 'JEFitness-StressTest/1.0',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (cookie) headers['Cookie'] = cookie;

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
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        const latency = Date.now() - start;
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, body: parsed, headers: res.headers, setCookie, latency, raw });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${method} ${path}`)); });

    if (payload) req.write(payload);
    req.end();
  });
}

/** Wrapper that records network errors without throwing */
async function req(method, path, opts, context) {
  try {
    const r = await request(method, path, opts);
    recordRequest(r.status, r.latency, context);
    if (VERBOSE && r.status >= 400) {
      console.log(`      body: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    return r;
  } catch (err) {
    recordNetworkError(err, context);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Signup. Returns { email, password } on success, null otherwise.
 * Uses a real-domain email so express-validator's isEmail() accepts it.
 */
async function signup(idx) {
  const ts = Date.now();
  const email = `stress${idx}x${ts}@${TEST_EMAIL_DOMAIN}`;
  const password = `StressPass${idx}Abc!`;
  const label = `new_user_${idx}`;


  const r = await req('POST', '/api/v1/auth/signup', {
    body: { firstName: 'Stress', lastName: `User${idx}`, email, password },
  }, { user: label, step: 'signup' });

  if (!r) return null;

  if (r.status === 200 || r.status === 201) {
    // 🚀 STRESS BYPASS: Auto-verify before login
    if (BYPASS_MODE) {
      // Fetch CSRF token first
      const csrfR = await req('GET', '/api/v1/csrf-token', {}, { user: label, step: 'get_csrf' });
      const csrfToken = csrfR?.body?.token || csrfR?.body?.csrfToken;
      
      if (!csrfToken || csrfR.status !== 200) {
        if (VERBOSE) console.log(`    [${label}/csrf] FAIL ${csrfR?.status || 'ERR'}`);
        return null;
      }
      
      const bypassR = await req('POST', '/api/v1/auth/stress-bypass-verify', {
        body: { email, _csrf: csrfToken },
      }, { user: label, step: 'bypass_verify' });
      
      if (VERBOSE) {
        console.log(`    [${label}] BYPASS ${bypassR ? bypassR.status : 'ERR'}`);
      }
      
      await sleep(100); // Brief pause after bypass
    }
    
    return { email, password };
  }

  // Surface the reason so we can fix it
  console.error(`  [SIGNUP FAIL] user_${idx} → HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return null;

}

/**
 * Login. Returns { token, cookie, userId } on success, null otherwise.
 */
async function login(email, password, label) {
  const r = await req('POST', '/api/v1/auth/login', {
    body: { email, password },
  }, { user: label, step: 'login' });

  if (!r) return null;

  if (r.status !== 200) {
    console.error(`  [LOGIN FAIL] ${label} → HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    return null;
  }

  const cookieHeader = (r.setCookie || []).map((c) => c.split(';')[0]).join('; ');
  const token = r.body?.token || null;
  const userId = r.body?.user?.id || r.body?.user?._id || null;

  return { token, cookie: cookieHeader, userId };
}

/** Grant data-processing + health-data consent for a new account. */
async function grantConsents(token, cookie, label) {
  await req('POST', '/api/v1/auth/consent', {
    token, cookie,
    body: {
      dataProcessingConsent: true,
      healthDataConsent: true,
      consentVersion: '1.1',
      healthConsentPurpose: 'fitness_tracking',
    },
  }, { user: label, step: 'consent' });
}

// ─── Permission probe helper ───────────────────────────────────────────────────

/**
 * Hit a route that should be forbidden for this role.
 * Flags it if the server responds 200 (permission bypass).
 */
async function permProbe(token, cookie, label, path, expectedForbidden) {
  const r = await req('GET', path, { token, cookie }, { user: label, step: `perm:${path}` });
  if (!r) return;
  if (r.status === 200 && expectedForbidden) {
    const msg = `[PERM FAIL] ${label} got 200 on ${path} — should be 401/403`;
    console.warn(`  ${msg}`);
    metrics.permFailures.push(msg);
  }
}

// ─── Role Scenarios ────────────────────────────────────────────────────────────

async function regularUserScenario(idx) {
  const label = `user_${idx}`;

  // 1. Signup
  const creds = await signup(idx);
  if (!creds) return;
  await sleep(THINK_TIME);

  // 2. Login
  const session = await login(creds.email, creds.password, label);
  if (!session) return;
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  // 3. Consent
  await grantConsents(token, cookie, label);
  await sleep(THINK_TIME);

  // 4. Own profile
  await req('GET', '/api/v1/users/me', { token, cookie }, { user: label, step: 'get_profile' });
  await sleep(THINK_TIME);

  // 5. Update profile
  await req('PUT', '/api/v1/users/me', {
    token, cookie,
    body: { currentWeight: 70 + idx, height: 170 + (idx % 15) },
  }, { user: label, step: 'update_profile' });
  await sleep(THINK_TIME);

  // 6. Log measurement
  await req('POST', '/api/v1/users/me/measurements', {
    token, cookie,
    body: { weight: 70 + idx, waist: 80, notes: 'stress test' },
  }, { user: label, step: 'log_measurement' });
  await sleep(THINK_TIME);

  // 7. Get measurements
  await req('GET', '/api/v1/users/me/measurements', { token, cookie }, { user: label, step: 'get_measurements' });
  await sleep(THINK_TIME);

  // 8. Log workout
  let workoutId = null;
  {
    const r = await req('POST', '/api/v1/workouts/log', {
      token, cookie,
      body: {
        workoutName: `Stress Workout ${idx}`,
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
            sets: [{ setNumber: 1, reps: 8, weight: 80, rpe: 8, completed: true }],
          },
        ],
        duration: 45,
        notes: 'stress test',
      },
    }, { user: label, step: 'log_workout' });
    workoutId = r?.body?._id || r?.body?.data?._id || null;
    await sleep(THINK_TIME);
  }

  // 9. Get workouts
  await req('GET', '/api/v1/workouts', { token, cookie }, { user: label, step: 'get_workouts' });
  await sleep(THINK_TIME);

  // 10. Workout stats
  await req('GET', '/api/v1/workouts/stats/summary', { token, cookie }, { user: label, step: 'workout_stats' });
  await sleep(THINK_TIME);

  // 11. Log meal
  let mealId = null;
  {
    const r = await req('POST', '/api/v1/nutrition/log', {
      token, cookie,
      body: {
        mealType: ['breakfast', 'lunch', 'dinner', 'snack'][idx % 4],
        foods: [
          { foodName: 'Chicken Breast', calories: 165, protein: 31, carbs: 0,  fat: 3.6, quantity: 150, unit: 'g' },
          { foodName: 'Brown Rice',     calories: 216, protein: 4.5, carbs: 45, fat: 1.8, quantity: 200, unit: 'g' },
        ],
        notes: 'stress test meal',
      },
    }, { user: label, step: 'log_meal' });
    mealId = r?.body?._id || r?.body?.data?._id || null;
    await sleep(THINK_TIME);
  }

  // 12. Get nutrition list
  await req('GET', '/api/v1/nutrition', { token, cookie }, { user: label, step: 'get_nutrition' });
  await sleep(THINK_TIME);

  // 13. Nutrition stats
  await req('GET', '/api/v1/nutrition/stats/summary', { token, cookie }, { user: label, step: 'nutrition_stats' });
  await sleep(THINK_TIME);

  // 14. Daily macros
  await req('GET', '/api/v1/nutrition/daily', { token, cookie }, { user: label, step: 'daily_macros' });
  await sleep(THINK_TIME);

  // 15. Create workout goal
  let goalId = null;
  {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const r = await req('POST', '/api/v1/workouts/goals', {
      token, cookie,
      body: { exercise: 'Deadlift', targetWeight: 100 + idx, targetDate: future },
    }, { user: label, step: 'create_goal' });
    goalId = r?.body?._id || r?.body?.data?._id || null;
    await sleep(THINK_TIME);
  }

  // 16. Get workout goals
  await req('GET', '/api/v1/workouts/goals', { token, cookie }, { user: label, step: 'get_goals' });
  await sleep(THINK_TIME);

  // 17. Subscription plans (public)
  await req('GET', '/api/v1/subscriptions/plans', {}, { user: label, step: 'get_plans' });
  await sleep(THINK_TIME);

  // 18. Current subscription
  await req('GET', '/api/v1/subscriptions/current', { token, cookie }, { user: label, step: 'get_subscription' });
  await sleep(THINK_TIME);

  // 19. Programs (public)
  await req('GET', '/api/v1/programs', {}, { user: label, step: 'get_programs' });
  await sleep(THINK_TIME);

  // 20-21. Permission probes — regular users must NOT reach admin or trainer routes
  await permProbe(token, cookie, label, '/api/v1/clients', true);
  await sleep(THINK_TIME);
  await permProbe(token, cookie, label, '/api/v1/trainer/dashboard', true);
  await sleep(THINK_TIME);

  // 22. Delete workout (cleanup)
  if (workoutId) {
    await req('DELETE', `/api/v1/workouts/${workoutId}`, { token, cookie }, { user: label, step: 'delete_workout' });
    await sleep(THINK_TIME);
  }

  // 23. Delete goal (cleanup)
  if (goalId) {
    await req('DELETE', `/api/v1/workouts/goals/${goalId}`, { token, cookie }, { user: label, step: 'delete_goal' });
    await sleep(THINK_TIME);
  }

  // 24. Delete own account (cleanup — keeps DB tidy on prod)
  await req('DELETE', '/api/v1/users/me', { token, cookie }, { user: label, step: 'delete_account' });

  console.log(`  [${label}] done`);
}

async function trainerScenario(creds, idx) {
  const label = `trainer_${idx}`;

  const session = await login(creds.email, creds.password, label);
  if (!session) return;
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/users/me', { token, cookie }, { user: label, step: 'get_profile' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/trainer/me', { token, cookie }, { user: label, step: 'trainer_me' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/trainer/dashboard', { token, cookie }, { user: label, step: 'trainer_dashboard' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/trainer/clients', { token, cookie }, { user: label, step: 'trainer_clients' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/trainer/appointments', { token, cookie }, { user: label, step: 'trainer_appointments' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/users/trainers', { token, cookie }, { user: label, step: 'list_trainers' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/programs', {}, { user: label, step: 'get_programs' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/subscriptions/plans', {}, { user: label, step: 'get_plans' });
  await sleep(THINK_TIME);

  // Perm probe — trainer must NOT reach admin-only /clients
  await permProbe(token, cookie, label, '/api/v1/clients', true);
  await sleep(THINK_TIME);

  await req('GET', '/api/health', {}, { user: label, step: 'health_check' });

  console.log(`  [${label}] done`);
}

async function adminScenario(creds, idx) {
  const label = `admin_${idx}`;

  const session = await login(creds.email, creds.password, label);
  if (!session) return;
  const { token, cookie } = session;
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/users/me', { token, cookie }, { user: label, step: 'get_profile' });
  await sleep(THINK_TIME);

  // Admin-only routes
  await req('GET', '/api/v1/clients?page=1&limit=20', { token, cookie }, { user: label, step: 'list_clients' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/clients/statistics', { token, cookie }, { user: label, step: 'client_stats' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/clients?search=test&page=1&limit=10', { token, cookie }, { user: label, step: 'search_clients' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/clients?sort=createdAt&order=desc', { token, cookie }, { user: label, step: 'filter_clients' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/users/trainers', { token, cookie }, { user: label, step: 'list_trainers' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/programs', {}, { user: label, step: 'get_programs' });
  await sleep(THINK_TIME);

  await req('GET', '/api/v1/subscriptions/current', { token, cookie }, { user: label, step: 'get_subscription' });
  await sleep(THINK_TIME);

  await req('GET', '/api/health', {}, { user: label, step: 'health_check' });
  await sleep(THINK_TIME);

  // Admin should not reach trainer-specific route unless also a trainer
  {
    const r = await req('GET', '/api/v1/trainer/dashboard', { token, cookie }, { user: label, step: 'perm:trainer_dashboard' });
    if (r?.status === 200) {
      console.log(`  [${label}] trainer/dashboard returned 200 (admin also has trainer role)`);
    }
  }

  console.log(`  [${label}] done`);
}

// ─── Report ────────────────────────────────────────────────────────────────────

function printReport() {
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const lats = [...metrics.latencies].sort((a, b) => a - b);
  const p = (frac) => lats[Math.floor(lats.length * frac)] ?? 0;
  const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
  const rps = (metrics.requests / duration).toFixed(2);

  const line = '═'.repeat(55);
  const dash = '─'.repeat(55);

  console.log(`\n${line}`);
  console.log('         JE FITNESS STRESS TEST REPORT');
  console.log(line);
  console.log(`  Target:         ${BASE_URL}`);
  console.log(`  Virtual users:  ${CONCURRENCY}  (${REGULAR_USER_COUNT} users / ${TRAINER_CREDS.length} trainers / ${ADMIN_CREDS.length} admins)`);
  console.log(`  Duration:       ${duration.toFixed(1)}s`);
  console.log(`  Total requests: ${metrics.requests}`);
  console.log(`  Throughput:     ${rps} req/s`);
  console.log(dash);
  console.log('  Outcomes:');
  console.log(`    2xx success:    ${metrics.successes}  (${pct(metrics.successes, metrics.requests)}%)`);
  console.log(`    Failures total: ${metrics.failures}  (${pct(metrics.failures, metrics.requests)}%)`);
  console.log(`      401/403:      ${metrics.permissionDenied}`);
  console.log(`      429 rate lim: ${metrics.rateLimited}`);
  console.log(`      5xx errors:   ${metrics.serverErrors}`);
  console.log(`      Network err:  ${metrics.networkErrors}`);
  console.log(`      Other (4xx):  ${metrics.failures - metrics.permissionDenied - metrics.rateLimited - metrics.serverErrors - metrics.networkErrors}`);
  console.log(dash);
  console.log('  Latency (ms):');
  console.log(`    avg  ${avg}   p50  ${p(0.5)}   p90  ${p(0.9)}   p99  ${p(0.99)}   max  ${lats[lats.length - 1] ?? 0}`);
  console.log(dash);

  if (metrics.errors.length) {
    console.log('  Non-2xx details (first 30):');
    metrics.errors.slice(0, 30).forEach((e) =>
      console.log(`    HTTP ${e.status}  ${e.user}/${e.step}`)
    );
  }

  if (metrics.permFailures.length) {
    console.log(dash);
    console.log('  PERMISSION FAILURES (routes that should be blocked but weren\'t):');
    metrics.permFailures.forEach((m) => console.log(`    ${m}`));
  } else {
    console.log('\n  [✓] All role-permission probes passed.');
  }

  const errorRate = metrics.failures / Math.max(metrics.requests, 1);
  if (metrics.requests === 0) {
    console.log('\n  [FAIL] No requests completed — check connectivity and credentials.');
    process.exitCode = 1;
  } else if (errorRate > 0.1) {
    console.log(`\n  [FAIL] Error rate ${(errorRate * 100).toFixed(1)}% exceeds 10% threshold.`);
    process.exitCode = 1;
  } else {
    console.log(`\n  [PASS] Error rate ${(errorRate * 100).toFixed(1)}% — within acceptable threshold.`);
  }

  console.log(`${line}\n`);
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nJE Fitness Stress Test — ${CONCURRENCY} virtual users`);
  console.log(`Target:     ${BASE_URL}`);
  console.log(`Think time: ${THINK_TIME}ms   Verbose: ${VERBOSE ? 'ON' : 'OFF (set STRESS_VERBOSE=1 to enable)'}`);
  console.log(`\nStarting all virtual users simultaneously...\n`);

  metrics.startTime = Date.now();

  const tasks = [];
  for (let i = 1; i <= REGULAR_USER_COUNT; i++) tasks.push(regularUserScenario(i));
  TRAINER_CREDS.forEach((c, i) => tasks.push(trainerScenario(c, i + 1)));
  ADMIN_CREDS.forEach((c, i) => tasks.push(adminScenario(c, i + 1)));

  await Promise.allSettled(tasks);

  metrics.endTime = Date.now();
  printReport();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
