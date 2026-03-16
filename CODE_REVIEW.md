# JE Fitness — Production Code Review

**Reviewer:** Kombai AI  
**Date:** 2026-03-16  
**Scope:** Full-stack audit (Node/Express backend + Vanilla JS frontend)

---

## Executive Summary

The codebase shows good security intent — helmet, CSP nonces, rate limiters, token versioning, input sanitization, and CSRF protection are all present. However, several **critical security vulnerabilities**, **silent bugs**, and **architectural problems** exist that must be resolved before production deployment at scale.

---

## 🔴 CRITICAL — Fix Before Deployment

### 1. Plaintext Password Stored in `sessionStorage` (`public/js/auth.js:339`)

**File:** `public/js/auth.js`

```js
// ❌ DANGEROUS — plaintext password persisted in browser storage
sessionStorage.setItem('signupAttempt', JSON.stringify({
    firstName, lastName, email, password, ...
}));
```

**Why:** Any script with page access can read `sessionStorage`, making this an XSS gold mine. `sessionStorage` is never an appropriate place to store credentials.

**Fix:** Store only `{ email }` for the resend flow. The `/api/v1/auth/resend-otp` endpoint only needs an email — the password is irrelevant:

```js
// ✅ Store only what's needed for OTP resend
sessionStorage.setItem('pendingVerificationEmail', email);
```

Update the resend handler to call `/api/v1/auth/resend-otp` with only the email.

---

### 2. Duplicate `static users` Block — Second Silently Overwrites First (`public/js/api.config.js:280–454`)

**File:** `public/js/api.config.js`

```js
// ❌ First definition (lines 280–301) — has getProfile, updateProfile, changePassword, getAll, getOne, delete
static users = { getProfile, updateProfile, changePassword, getAll, getOne, delete };

// ❌ Second definition (lines 429–454) — silently OVERWRITES the first
static users = { getTrainers, getAdmins, getProfile, updateProfile, ... };
```

**Why:** In a class body, the last static field assignment wins. The first `users` block is dead code. Methods from the first block (`changePassword`) that aren't in the second will be silently missing.

**Fix:** Merge both blocks into a single `static users = { ... }` definition.

---

### 3. User Enumeration via Login Error Message (`src/controllers/authController.js:154`)

**File:** `src/controllers/authController.js`

```js
// ❌ Reveals whether an email is registered
throw new AuthenticationError(`No account found for email: ${email}`);
```

**Fix:** Use a generic message for both "user not found" and "wrong password":

```js
// ✅ Constant-time, non-enumerating response
throw new AuthenticationError('Invalid email or password.');
```

---

### 4. Cryptographically Weak OTP Generation (`src/models/User.js:221`)

**File:** `src/models/User.js`

```js
// ❌ Math.random() is NOT cryptographically secure
UserSchema.methods.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
```

**Fix:**

```js
// ✅ Use crypto module for CSPRNG
const crypto = require('crypto');
UserSchema.methods.generateOTP = function() {
  return crypto.randomInt(100000, 1000000).toString();
};
```

---

### 5. XSS via `innerHTML` with Unsanitized User Data (`public/js/appointments.js:143`)

**File:** `public/js/appointments.js`

```js
// ❌ app.notes is user-supplied and injected directly into innerHTML
<div class="text-truncate text-muted appt-notes-cell" title="${app.notes || ''}">${app.notes || '...'}</div>
```

The same issue exists in `viewAppointment()` (line 185) where appointment fields are inserted into `detailsDiv.innerHTML`.

**Fix:** Create a helper to escape HTML before inserting into the DOM:

```js
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str ?? ''));
    return div.innerHTML;
}
// Then use escapeHtml(app.notes) throughout
```

Or better: use `textContent` / `createElement` instead of template literals with `innerHTML`.

---

### 6. Silent Auto-Consent Grant on 403 — GDPR Violation (`public/js/appointments.js:32–38`)

**File:** `public/js/appointments.js`

```js
// ❌ Consent is granted without explicit user acknowledgement
if (body.code === 'CONSENT_REQUIRED') {
    await fetch(`${window.API_BASE}/api/v1/auth/consent`, { method: 'POST', ... });
    const retry = await fetch(url, options); // silently retries
    ...
}
```

**Why:** GDPR and HIPAA require that consent be **freely given, specific, informed, and unambiguous**. Auto-granting consent in a catch block is legally non-compliant and likely invalid.

**Fix:** Show a consent modal asking the user to explicitly agree before making the consent API call.

---

### 7. `signupLimiter` Exported But Never Applied to Signup Route (`src/routes/auth.js:16`)

**File:** `src/routes/auth.js`

```js
// ❌ Signup has NO rate limiter — unlimited signup spam is possible
router.post('/signup', [...validators], authController.signup);
```

The `signupLimiter` exists in `rateLimiter.js` and is exported, but is never imported or used in `auth.js`.

**Fix:**

```js
const { authLimiter, signupLimiter } = require('../middleware/rateLimiter');
router.post('/signup', signupLimiter, [...validators], authController.signup);
```

---

## 🟠 HIGH — Fix Before Launch

### 8. Health Check on Every Single API Request — 2× Latency (`public/js/api.config.js:126–175`)

**File:** `public/js/api.config.js`

```js
// ❌ Every API call makes an extra health-check round-trip first
static async request(endpoint, options = {}) {
    if (!await this.checkBackendHealth()) {   // Extra HTTP request
        throw new Error('Backend service is currently unavailable...');
    }
    // ... then the actual request
}
```

**Why:** This doubles the number of HTTP requests. For a page that makes 5 API calls on load, that's 10 round-trips. On a cold Render.com instance, `checkBackendHealth` may take the full 3s timeout before any data loads.

**Fix:** Use a cached health status with a TTL (e.g., 30 seconds), or remove the pre-flight check entirely and handle `fetch` failures in the catch block (which already handles `TypeError: Failed to fetch`).

```js
// ✅ Cache health check result with TTL
static _healthCache = { ok: null, checkedAt: 0 };
static async isHealthy() {
    if (Date.now() - this._healthCache.checkedAt < 30000) return this._healthCache.ok;
    const ok = await this.checkBackendHealth();
    this._healthCache = { ok, checkedAt: Date.now() };
    return ok;
}
```

---

### 9. `config/db.js` Is Unused — Server Uses Its Own Inline `connectDB` (`src/server.js:95`)

**File:** `src/server.js`

`config/db.js` has a robust `connectDB` with exponential backoff retry (5 attempts). `server.js` ignores it and uses its own inline version without retry logic. The file in `/config/db.js` is dead code.

**Fix:** Delete `config/db.js` or replace `server.js`'s inline `connectDB` with an import:

```js
// ✅ In server.js
const connectDB = require('../config/db');
if (process.env.NODE_ENV !== 'test') connectDB();
```

---

### 10. `exec()` for Cron Backup/Archive Jobs — Shell Injection Risk (`src/server.js:404,411,441`)

**File:** `src/server.js`

```js
// ❌ exec() spawns a shell — susceptible to injection; also creates orphaned child processes
exec('node scripts/backup.js', (error, stdout, stderr) => { ... });
```

**Fix:** Import and call the script functions directly. If they must be separate processes, use `spawn` with an explicit argument array (no shell):

```js
const { spawn } = require('child_process');
spawn(process.execPath, ['scripts/backup.js'], { stdio: 'inherit' });
```

---

### 11. Both `bcrypt` and `bcryptjs` Are Dependencies (`package.json`)

**File:** `package.json`

```json
"bcrypt": "^6.0.0",     // native C++ bindings
"bcryptjs": "^3.0.2"    // pure JS fallback
```

The codebase only imports `bcryptjs`. `bcrypt` is unused, bloating the install and creating a potential version conflict. Pick one.

**Fix:** Remove `bcrypt` from `dependencies`:

```bash
npm uninstall bcrypt
```

---

### 12. `CORS` Allows `origin === 'null'` (`src/middleware/corsConfig.js:44`)

**File:** `src/middleware/corsConfig.js`

```js
// ❌ 'null' origin comes from sandboxed iframes and can be spoofed
if (allowedOrigins.includes(origin) || origin === 'null') {
    callback(null, true);
}
```

**Fix:** Remove `origin === 'null'` from the condition. This is never a legitimate production origin.

---

### 13. CSRF Token Store Is In-Memory — Breaks Horizontal Scaling (`src/middleware/csrf.js`)

**File:** `src/middleware/csrf.js`

```js
this.tokens = new Map(); // ❌ Instance-local — not shared across pods/workers
```

If you run more than one Node.js process (PM2, Render replicas), CSRF tokens generated by one instance won't be found by another, causing false 403s.

**Fix:** Since Redis was removed, use a signed double-submit cookie pattern (stateless) or store tokens in MongoDB with a TTL index. The existing `WebhookEvent` MongoDB TTL pattern is a good template.

---

### 14. `PORT` Has No Default Fallback (`src/server.js:22`)

**File:** `src/server.js`

```js
const PORT = process.env.PORT; // ❌ undefined if env var is missing
```

**Fix:**

```js
const PORT = process.env.PORT || 10000;
```

---

### 15. Tokens Stored in `localStorage` — XSS-Accessible (`public/js/api.config.js:177`)

**File:** `public/js/api.config.js`

JWT tokens in `localStorage` are readable by any JavaScript on the page. Given the XSS vulnerability in #5, this is a complete token theft vector.

**Fix (Preferred):** Issue tokens as `HttpOnly; Secure; SameSite=Strict` cookies from the server. The frontend never touches the token — the browser sends it automatically.

**Fix (Minimum):** If cookies aren't feasible now, ensure all XSS vectors are patched first (issue #5).

---

## 🟡 MEDIUM — Important Improvements

### 16. Double Logging — `morgan` + `requestLogger` Both Active (`src/server.js:59,60`)

```js
app.use(requestLogger); // custom logger
app.use(morgan('combined')); // also logs every request
```

Remove one or configure `morgan` to output only what the custom logger doesn't.

---

### 17. `fs.existsSync` Blocks the Event Loop (`src/server.js:309`)

```js
if (fs.existsSync(resolvedPath)) { // ❌ Synchronous I/O on every page request
    return res.sendFile(resolvedPath);
}
```

**Fix:**

```js
res.sendFile(resolvedPath, err => {
    if (err) next(); // file not found → 404
});
```

---

### 18. Login Error Leaks Internal `err` Object via `catch` (`src/middleware/auth.js:79`)

```js
catch (err) {
    if (err.name === 'TokenExpiredError') { ... }
    return res.status(401).json({ error: 'Invalid session...' }); // ✅ OK
}
```

But `AuthenticationError` thrown inside try is also caught here and returns a generic 401, which overwrites the cleaner error classes. Restructure to re-throw `AppError` subtypes and let the global `errorHandler` handle them.

---

### 19. `getPasswordRequirements` Not Exported from `src/utils/validators.js`

**File:** `public/js/auth.js:155`

```js
const reqs = Validators.getPasswordRequirements(password); // Used in frontend
```

But `getPasswordRequirements` is not defined in `src/utils/validators.js`. This means the function either exists only in a browser-only duplicate (`public/js/validators.js`) or it will throw at runtime.

**Fix:** Audit `public/js/validators.js` vs `src/utils/validators.js` and unify them — the intent of the comment at the top of `src/utils/validators.js` ("Shared validation utilities for both client and server") is never fulfilled.

---

### 20. Swagger/ReDoc Routes Exposed Without Auth in Non-Production Only — But No Prod Guard on Raw JSON (`src/server.js:228`)

```js
// ✅ Swagger UI gated to non-production
if (process.env.NODE_ENV !== 'production') { ... }

// But also registered:
app.get('/api-docs.json', ...); // ❌ Inside the same block — OK, but double-check
```

Confirm `NODE_ENV=production` is always set in the deployment environment and that the `swagger-jsdoc` spec doesn't include sensitive implementation details (DB schema field names, error codes, internal routes).

---

### 21. `getEmailStatus` Endpoint Has No Authentication (`src/routes/auth.js:108`)

```js
// ❌ Anyone with a messageId can check Mailjet delivery status
router.get('/email-status/:messageId', authController.getEmailStatus);
```

**Fix:** Add `auth` middleware or remove this endpoint from production. This is "for debugging" per the Swagger comment.

---

### 22. Login Logs `Role: ${userRole}` to Console/Toast in Production (`public/js/auth.js:94`)

```js
window.Toast.success(`Welcome back ${userName}! (Role: ${userRole})`); // DEBUG toast
console.log('Login success: Set role:', userRole);
console.log('Login redirect check: redirectPath=', redirectPath);
console.log('Redirecting to URL param:', redirectPath);
```

Strip all `// DEBUG` console logs and remove the role from user-facing toast messages before production.

---

### 23. `localStorage` Role Used for Client-Side Routing — Spoofable (`public/js/auth.js:88–114`)

```js
const userRole = user.role || 'user';
localStorage.setItem('userRole', userRole);
// Later used for redirect decisions...
```

Client-side role checks based on `localStorage` can be spoofed — a user can set `localStorage.userRole = 'admin'` in DevTools. **Server routes must always enforce role**, which they do. But the UI should derive display state from the server response, not from a stored string.

---

## 🟢 ARCHITECTURAL RECOMMENDATIONS

### A. Introduce a Centralized `AppError` on the Frontend

The backend has a clean `AppError` → `ValidationError` / `AuthenticationError` hierarchy. The frontend has ad-hoc `if (err.message.includes('...'))` string matching in `auth.js` (lines 121–135). Create a thin `ApiError` class client-side that carries `statusCode`, `code`, and `message`.

---

### B. Replace `window.API_BASE` Global with Module Imports

Multiple frontend files (`appointments.js`, `auth.js`) set and read `window.API_BASE` manually. The `API` class in `api.config.js` already encapsulates this. All files should use `window.API.*` methods rather than calling `fetch(window.API_BASE + ...)` directly.

---

### C. Move All Cron Jobs Out of `server.js`

`server.js` contains 5 `cron.schedule()` calls and 1 `setInterval`, totalling ~80 lines of job logic mixed into the server bootstrap. Extract to `src/jobs.js` (which already exists and has `startSubscriptionCleanupJob`) — move all cron definitions there.

---

### D. Environment-Specific Config File

The hardcoded `'https://jefitness.onrender.com'`, `'http://localhost:10000'`, `'http://localhost:5500'` strings appear in at least 4 different files (`api.config.js`, `corsConfig.js`, `security.js`, `server.js`). Centralize them in a single `src/config/environment.js` that reads from `process.env` and exports validated config objects.

---

### E. Add a `CHANGELOG.md` / Remove `TODO.md` From Repo Root

`TODO.md` documents a debugging session (HTTPS/HTTP SSL fix) and should not live in the repo root long-term. Move resolved items to `CHANGELOG.md` and track pending work in your issue tracker.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 CRITICAL | `public/js/auth.js:339` | Plaintext password in `sessionStorage` |
| 2 | 🔴 CRITICAL | `public/js/api.config.js:280,429` | Duplicate `static users` — first silently overwritten |
| 3 | 🔴 CRITICAL | `src/controllers/authController.js:154` | User enumeration via login error |
| 4 | 🔴 CRITICAL | `src/models/User.js:221` | Weak OTP via `Math.random()` |
| 5 | 🔴 CRITICAL | `public/js/appointments.js:143` | XSS via unsanitized `innerHTML` |
| 6 | 🔴 CRITICAL | `public/js/appointments.js:32` | Silent auto-consent — GDPR violation |
| 7 | 🔴 CRITICAL | `src/routes/auth.js:16` | `signupLimiter` never applied to signup |
| 8 | 🟠 HIGH | `public/js/api.config.js:126` | Health check on every request — 2× latency |
| 9 | 🟠 HIGH | `src/server.js:95` | `config/db.js` unused — dead code w/ better retry |
| 10 | 🟠 HIGH | `src/server.js:404` | `exec()` for cron scripts — shell injection risk |
| 11 | 🟠 HIGH | `package.json` | Both `bcrypt` + `bcryptjs` as deps |
| 12 | 🟠 HIGH | `src/middleware/corsConfig.js:44` | `origin === 'null'` allowed |
| 13 | 🟠 HIGH | `src/middleware/csrf.js` | In-memory CSRF store — breaks horizontal scaling |
| 14 | 🟠 HIGH | `src/server.js:22` | `PORT` has no default fallback |
| 15 | 🟠 HIGH | `public/js/api.config.js:177` | JWT in `localStorage` — XSS-accessible |
| 16 | 🟡 MEDIUM | `src/server.js:59,60` | Double logging (`morgan` + `requestLogger`) |
| 17 | 🟡 MEDIUM | `src/server.js:309` | `fs.existsSync` blocks event loop |
| 18 | 🟡 MEDIUM | `src/middleware/auth.js:79` | `AppError` subtypes caught and flattened |
| 19 | 🟡 MEDIUM | `public/js/auth.js:155` | `getPasswordRequirements` may be undefined |
| 20 | 🟡 MEDIUM | `src/routes/auth.js:108` | Email status endpoint unauthenticated |
| 21 | 🟡 MEDIUM | `public/js/auth.js:94` | Debug logs + role in toast left in code |
| 22 | 🟡 MEDIUM | `public/js/auth.js:88` | `localStorage` role used for routing decisions |
