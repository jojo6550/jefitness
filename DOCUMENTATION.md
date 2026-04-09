# JE Fitness Platform - Technical Documentation

**Version:** 1.2  
**Last Updated:** April 2026  
**Stack:** Express 5 / MongoDB / Stripe / Vanilla JS  
**Repository:** `jojo6550/jojo6550.github.io`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend Core](#2-backend-core)
3. [Configuration](#3-configuration)
4. [Middleware Layer](#4-middleware-layer)
5. [Data Models](#5-data-models)
6. [Services](#6-services)
7. [Routes & Controllers](#7-routes--controllers)
8. [Utilities](#8-utilities)
9. [Cron Jobs & Background Tasks](#9-cron-jobs--background-tasks)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Frontend Core Modules](#11-frontend-core-modules)
12. [Frontend Page Modules](#12-frontend-page-modules)
13. [Frontend Service Layer](#13-frontend-service-layer)
14. [Admin Module](#14-admin-module)
15. [Testing](#15-testing)
16. [Scripts & Tooling](#16-scripts--tooling)
17. [Security Model](#17-security-model)
18. [Subscription & Billing Flow](#18-subscription--billing-flow)
19. [GDPR / Compliance](#19-gdpr--compliance)
20. [Environment Variables](#20-environment-variables)

---

## 1. Architecture Overview

JE Fitness is a **multi-page application** (MPA) — not a SPA. Each page in `public/pages/*.html` loads its own JavaScript bundle from `public/js/`. The backend serves these files statically and maps clean URLs (e.g. `/dashboard` maps to `/pages/dashboard.html`) via a middleware in `src/server.js`.

### High-Level Diagram

```
Browser (HTML pages + vanilla JS)
  │
  ├─ public/js/api.config.js      ← resolves API_BASE
  ├─ public/js/auth-cache.js       ← singleton /auth/me cache
  ├─ public/js/services/*.js       ← thin fetch wrappers
  └─ public/js/<page>.js           ← page-specific logic
         │
         ▼
Express 5 Server (src/server.js)
  │
  ├─ Middleware Stack (security, auth, consent, rate limiting)
  ├─ /api/v1/* routes
  ├─ /webhooks (Stripe)
  ├─ /admin (admin dashboard)
  └─ Static file serving (public/)
         │
         ├─ MongoDB (Mongoose ODM)
         ├─ Stripe API (payments, subscriptions)
         └─ Resend (transactional email)
```

### Request Lifecycle

1. **Incoming request** hits Express with body parsing, cookie parsing, CORS.
2. **Security middleware** applies: CSP nonce generation, Helmet headers, input sanitization, CSRF protection.
3. **Request logging** assigns a unique request ID and timestamps the start.
4. **Routing** determines the handler — either a static file, a clean URL rewrite to an HTML page, or an API endpoint.
5. **Protected API routes** pass through: `auth` → `requireDataProcessingConsent` → (optional `requireHealthDataConsent`) → `checkDataRestriction` → `apiLimiter` → `versioning`.
6. **Controller** processes the request using models and services.
7. **Error handler** catches any unhandled errors and returns a standardised JSON response.

### Role Model

The application supports three roles:

| Role | Description | Access Level |
|------|-------------|--------------|
| `user` | Regular gym member | Personal data, workouts, nutrition, appointments, subscriptions |
| `trainer` | Fitness trainer | Own client list, appointment management, client profiles |
| `admin` | Platform administrator | All data, user management, logs, system monitoring |

---

## 2. Backend Core

### `src/server.js`

The application entry point. Responsible for assembling the Express application, connecting to MongoDB, registering all middleware and routes, starting cron jobs, and handling graceful shutdown.

**Key Responsibilities:**

- **Loads environment** via `dotenv` at the top of the file.
- **Body parsing** with a 10KB JSON limit and URL-encoded support.
- **Cookie parsing** via `cookie-parser` for httpOnly JWT cookies.
- **CORS** configured in `src/middleware/corsConfig.js` — restricted to `jefitnessja.com` and `localhost:10000`.
- **Security headers** via Helmet with a custom CSP policy including per-request nonces.
- **Request logging, input sanitization, CSRF protection** applied globally.
- **Cache control** applied based on asset type (HTML: no-cache; JS/CSS: 30 days; images/fonts: 1 year).
- **Clean URL rewriting** — matches paths like `/dashboard` or `/clients/:id` and serves the corresponding HTML file from `public/pages/`.
- **Health endpoint** at `GET /api/health` returns database status, uptime, and environment.
- **CSRF token endpoint** at `GET /api/v1/csrf-token`.
- **USDA food search proxy** at `GET /api/v1/nutrition/food-search` — proxies to the USDA FoodData Central API.
- **API route mounting** — unprotected routes (`/subscriptions`, `/auth`) and protected routes with the full middleware stack.
- **Swagger/ReDoc** documentation served in non-production environments.
- **404 handler** for unmatched API routes.
- **Global error handler** as the final middleware.
- **Cron jobs** for unverified account cleanup (every 30 minutes), subscription cleanup, renewal reminders, and trainer daily emails.
- **Self-ping** in production to prevent sleep on free hosting (Render).
- **Graceful shutdown** on SIGINT/SIGTERM — stops file watchers, stops CSRF cleanup, closes HTTP server, closes MongoDB connection.

**Exported:** `app` (Express instance). `startServer()` runs only when executed directly (`require.main === module`).

#### Functions

| Function | Description |
|----------|-------------|
| `startServer()` | Connects to MongoDB, registers event listeners for disconnection/reconnection, starts cron jobs, starts HTTP listener, configures graceful shutdown. |
| Anonymous cron callback | Deletes unverified user accounts older than `CLEANUP_TIME` minutes. |
| `gracefulShutdown(signal)` | Stops file watching, stops CSRF timer, closes HTTP server, closes MongoDB connection, exits process. |

---

### `src/jobs.js`

Defines three scheduled cron jobs that run independently from the request/response cycle. Each function registers a `node-cron` schedule and logs its own lifecycle events.

#### `startSubscriptionCleanupJob()`

**Schedule:** `0 0 * * *` (midnight daily)

Finds subscriptions in MongoDB with status `active` or `past_due` whose `currentPeriodEnd` is in the past. For each:

1. **Verifies with Stripe** by retrieving the subscription via the Stripe API.
2. If Stripe says the subscription is still active (`active`, `trialing`, `past_due`, `paused`, `incomplete`), **syncs the period dates** from Stripe back to MongoDB and skips cancellation.
3. If Stripe confirms inactive, or if the subscription has no Stripe ID, marks it as `canceled` in MongoDB with a status history entry.
4. If Stripe is unreachable, **skips** the subscription rather than incorrectly cancelling.

**Why:** Stripe is the authoritative source of truth. Local period dates can become stale, especially in Stripe test mode where billing cycles are compressed. This job prevents false cancellations.

#### `startRenewalReminderJob()`

**Schedule:** `0 8 * * *` (8 AM daily)

Sends email reminders to users whose subscriptions renew in exactly 3 or 7 days. Respects the user's `privacySettings.marketingEmails` preference — does not send if the user has opted out.

**Why:** Gives users advance notice before automatic renewal charges, as required by consumer protection regulations.

#### `startTrainerDailyEmailJob()`

**Schedule:** `0 0 * * *` (midnight daily)

Queries today's non-cancelled appointments, groups them by trainer, filters out trainers who prefer individual notifications over the daily digest, and sends each eligible trainer an email with a sorted schedule table.

**Why:** Trainers need to know their daily client lineup. The daily digest preference (`trainerEmailPreference`) prevents duplicate notifications for trainers who receive per-appointment emails.

---

## 3. Configuration

### `config/db.js`

Connects to MongoDB using Mongoose with exponential backoff retry logic.

| Parameter | Value |
|-----------|-------|
| Max retries | 5 |
| Selection timeout | 5000ms |
| Backoff strategy | Exponential: 2^retry * 1000ms |

Exits the process with code 1 after all retries are exhausted.

### `src/config/security.js`

Exports two items used by `server.js`:

**`nonceMiddleware`** — Generates a random 16-byte base64 CSP nonce per request and stores it on `res.locals.cspNonce`. This nonce is embedded in `<script>` tags and validated by the Content Security Policy.

**`helmetOptions`** — A comprehensive Helmet/CSP configuration:

| Directive | Sources Allowed |
|-----------|----------------|
| `defaultSrc` | `'self'` |
| `scriptSrc` | `'self'`, CDN hosts (jsdelivr, cdnjs, unpkg), Stripe JS, per-request nonce |
| `styleSrc` | `'self'`, `'unsafe-inline'`, Google Fonts, CDN hosts |
| `connectSrc` | `'self'`, Stripe API, CDN, production/dev origins |
| `frameSrc` | `'self'`, Stripe checkout/hooks |
| `imgSrc` | `'self'`, `data:`, placeholder, CDN, Stripe |
| `objectSrc` | `'none'` |
| `baseUri` | `'self'` |
| `formAction` | `'self'` |

Also enables HSTS (1 year, preload), `noSniff`, `xssFilter`, `strict-origin-when-cross-origin` referrer, frame denial, and blocks cross-domain policies.

### `src/config/subscriptionConstants.js`

Defines `ALLOWED_WEBHOOK_EVENTS` — the whitelist of Stripe event types the webhook handler will process. Any event not in this list is acknowledged but ignored. Includes customer, subscription, invoice, payment intent, and checkout events.

---

## 4. Middleware Layer

The middleware layer implements defence-in-depth security. Each middleware is a single-responsibility module.

### `src/middleware/auth.js`

**Purpose:** JWT authentication and token version verification.

#### `auth(req, res, next)`

The primary authentication middleware applied to all protected routes.

**Token extraction priority:**
1. httpOnly cookie (`req.cookies.token`) — preferred
2. `Authorization: Bearer <token>` header
3. `x-auth-token` header

**Process:**
1. Extracts the JWT token from one of the three sources.
2. Verifies the token signature and expiration using `jwt.verify()`.
3. Validates the token structure (must contain `id` or `userId`).
4. Fetches the user from MongoDB with `+tokenVersion` projection.
5. Compares the token's `tokenVersion` against the database value — rejects outdated tokens.
6. Sets `req.user` (decoded JWT with fresh role from DB) and `req.userDoc` (full Mongoose document for downstream middleware).

**Why the role is re-fetched from DB:** JWT claims become stale if a user's role is changed after the token was issued. The `auth` middleware always reads the current role from MongoDB and overwrites the JWT claim. Downstream middleware like `requireAdmin` can trust `req.user.role` without additional queries.

**Why token versioning exists:** When a password is changed or a security event occurs, `incrementUserTokenVersion()` bumps the version in the database. All existing JWTs for that user become invalid because their `tokenVersion` is now lower than the database value. This is restart-safe and works across multiple server instances.

#### `incrementUserTokenVersion(userId)`

Increments the `tokenVersion` field on the User document. Called after password changes or security events. Effectively invalidates all existing JWTs for the user.

#### `getUserTokenVersion(userId)`

Returns the current token version from the database. Used during token issuance to embed the current version in the JWT.

#### `requireAdmin(req, res, next)`

Returns 403 if `req.user.role !== 'admin'`. Relies on `auth` having already refreshed the role from the database.

#### `requireTrainer(req, res, next)`

Returns 403 if `req.user.role !== 'trainer'`. Logs a security warning on denial.

#### `isWebhookEventProcessed(eventId)`

Checks the `WebhookEvent` collection for a document matching the Stripe event ID. Returns `true` if found (event already processed) or on database error (safe failure mode — prevents duplicate processing).

#### `markWebhookEventProcessed(eventId, eventType)`

Creates a `WebhookEvent` document with a 24-hour TTL. Uses `ensureProcessed()` on the model to handle race conditions via upsert, preventing duplicate key errors when two instances process the same event simultaneously.

---

### `src/middleware/consent.js`

**Purpose:** GDPR/HIPAA consent enforcement. Ensures users have provided necessary consents before accessing protected resources.

#### `requireDataProcessingConsent(req, res, next)`

Checks `user.dataProcessingConsent.given`. Admin users are exempt. Returns 403 with code `CONSENT_REQUIRED` if consent is missing. Fires a non-blocking audit log entry on success.

**Uses `req.userDoc`** (pre-fetched by `auth` middleware) to avoid an additional database query.

#### `requireHealthDataConsent(req, res, next)`

Applied to health-related routes (`/logs`, `/medical-documents`, `/workouts`, `/nutrition`). Checks `user.healthDataConsent.given`. Returns 403 with code `HEALTH_CONSENT_REQUIRED` if missing.

#### `requireMarketingConsent(req, res, next)`

Checks `user.marketingConsent.given` and that `withdrawnAt` is null. Used for marketing-related operations.

#### `checkDataRestriction(req, res, next)`

Checks `user.dataSubjectRights.restrictionRequested`. If true, blocks all data processing with a 403 `DATA_RESTRICTED` response. This implements GDPR Article 18 (Right to Restriction of Processing).

#### `logAuditEvent(user, action, details)`

Private helper. Creates a `UserActionLog` entry with the user ID, action, IP address, User-Agent, and additional details. Non-blocking — errors are silently recorded by the monitoring service.

#### `getClientIP(req)`

Extracts the client IP from various sources in order of reliability: `req.ip`, connection remote address, socket remote address, `x-forwarded-for`, `x-real-ip`.

---

### `src/middleware/csrf.js`

**Purpose:** Cross-Site Request Forgery protection using single-use tokens.

**Exported as a singleton instance** of the `CSRFProtection` class.

#### Class: `CSRFProtection`

**Properties:**
- `tokens` — `Map<string, {userId, createdAt, userAgent, ip}>` of active tokens.
- `tokenTTL` — 1 hour (3,600,000ms).
- `cleanupInterval` — 1 hour between cleanup sweeps.

#### `generateToken(req) → string`

Creates a cryptographically random 32-byte hex token and stores its metadata (userId, timestamp, User-Agent, IP) in the in-memory map.

#### `verifyToken(req) → {valid: boolean, error?: string}`

Reads the token from `req.body._csrf` or the `x-csrf-token` header. Validates: token exists in map, not expired, User-Agent matches. **Single-use** — the token is deleted after successful verification.

**Why User-Agent is checked:** If a token is stolen via XSS but used from a different browser/client, the User-Agent mismatch catches it.

#### `middleware() → Function`

Returns an Express middleware function:
- **Safe methods** (GET, HEAD, OPTIONS): generates a new token and sets it in `res.locals.csrfToken` and the `X-CSRF-Token` response header.
- **Webhooks**: bypassed — they use Stripe signature verification.
- **Public auth routes** (signup, login, forgot-password, etc.): bypassed — accessible without prior authentication.
- **JWT-authenticated requests** (Bearer header or httpOnly cookie): bypassed — JWT provides implicit CSRF protection.
- **All other state-changing requests**: verifies the CSRF token.

#### `startCleanup()` / `stop()`

Periodic timer that sweeps expired tokens from the map. `stop()` is called during graceful shutdown.

---

### `src/middleware/rateLimiter.js`

**Purpose:** Rate limiting with identity-aware key generation using `express-rate-limit`.

#### `identityAwareKeyGenerator(req) → string`

Priority order for identifying the requester:
1. Authenticated user ID (`user:<id>`)
2. Email from request body (`email:<email>`) — for auth routes
3. Normalised IP address via `ipKeyGenerator` — IPv6-safe, Cloudflare-compatible

| Limiter | Window | Max Requests | Purpose |
|---------|--------|-------------|---------|
| `authLimiter` | 15 min | 10 | Brute-force login protection |
| `signupLimiter` | 20 min | 8 | Signup abuse/enumeration prevention |
| `passwordResetLimiter` | 1 hour | 3 | Reset abuse prevention |
| `checkoutLimiter` | 15 min | 10 | Payment fraud prevention |
| `apiLimiter` | 15 min | 100 | General API DDoS protection |
| `adminLimiter` | 15 min | 50 | Admin endpoint protection |
| `verificationPollLimiter` | 15 min | 120 | Email verification polling |

All limiters use standardised headers (`RateLimit-*`) and return a `RATE_LIMIT_EXCEEDED` code. Custom handlers log security warnings.

---

### `src/middleware/errorHandler.js`

**Purpose:** Centralised error handling and custom error class hierarchy.

#### Error Classes

| Class | Status | Use Case |
|-------|--------|----------|
| `AppError` | Configurable | Base class for all application errors |
| `ValidationError` | 400 | Request validation failures with field-level errors |
| `AuthenticationError` | 401 | Invalid/expired tokens, missing credentials |
| `AuthorizationError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `DatabaseError` | 500 | MongoDB operation failures |
| `ExternalServiceError` | 503 | Stripe/email/external API failures |

#### `errorHandler(err, req, res, next)`

The global error handler — must be the **last middleware** registered.

**Behaviour:**
- **5xx errors** without an explicit `statusCode`: message is masked to `"Internal server error"` to prevent information disclosure.
- **Security errors** (401, 403): logged as security events via `logSecurityEvent()`.
- **Stack traces**: included only in the `test` environment, never in production.
- **Duplicate header protection**: if `res.headersSent` is true, passes to Express default handler.
- Builds a standardised `{ error: { message, status, timestamp, requestId } }` response.

#### `asyncHandler(fn)`

Wraps async route handlers to catch promise rejections and forward them to `next()`. Eliminates the need for try/catch in every route.

---

### `src/middleware/inputValidator.js`

**Purpose:** NoSQL injection prevention, dangerous field stripping, and input validation.

#### `stripDangerousFields(req, res, next)`

Removes fields from `req.body` that could enable privilege escalation: `role`, `isAdmin`, `isEmailVerified`, `tokenVersion`, `stripeCustomerId`, `_id`, `__v`, `auditLog`, `dataSubjectRights`, and others. Logs a security warning when fields are stripped.

#### `allowOnlyFields(allowedFields, strict) → middleware`

Whitelist-based field filtering. In strict mode, rejects the request with 400 if disallowed fields are present. In non-strict mode, silently removes them.

#### `preventNoSQLInjection(req, res, next)`

Recursively inspects `req.body` and `req.query` for:
- Keys starting with `$` (MongoDB operators)
- String values containing MongoDB operators
- `RegExp` object values
- Excessive nesting depth (>10 levels — DoS protection)

Blocks all MongoDB query operators including `$where`, `$expr`, `$function`, `$ne`, `$gt`, `$regex`, aggregation operators, and geospatial operators.

#### `validateObjectId(paramName) → middleware`

Validates that a URL parameter matches the MongoDB ObjectId format (24 hex characters).

#### `handleValidationErrors(req, res, next)`

Processes `express-validator` validation results and returns a standardised error response with field-level error messages.

#### `validateSortParam(allowedFields) → middleware`

Validates sort query parameters against a whitelist and blocks MongoDB operator injection in sort fields.

#### `validateAggregationPipeline(pipeline) → boolean`

Validates MongoDB aggregation pipelines against a whitelist of safe stages (`$match`, `$project`, `$sort`, `$limit`, `$skip`, `$group`, `$unwind`, `$lookup`, `$count`). Blocks code execution stages (`$where`, `$function`, `$accumulator`, `$expr`).

#### `limitRequestSize(maxSize) → middleware`

Secondary size check (in addition to `express.json({ limit: '10kb' })`) that validates the serialised body length.

---

### `src/middleware/ownershipVerification.js`

**Purpose:** IDOR (Insecure Direct Object Reference) prevention.

#### `verifyOwnership(options) → middleware`

Generic ownership verification middleware. Takes configuration:
- `getResourceId(req)` — extracts the resource ID from the request
- `getOwnerId(resourceId, req)` — async function that resolves the owner's user ID
- `resourceName` — for error messages
- `allowAdmin` — whether admins bypass ownership checks (default: true)

Compares the resource owner's ID with the authenticated user's ID. Logs `idor_attempt_blocked` security events on mismatch.

#### `verifyUserOwnership`

Pre-configured instance for user profile endpoints where the resource ID is the owner ID.

#### `verifyModelOwnership(Model, resourceName, paramName)`

Factory for Mongoose models with a `userId` field. Queries the model by the URL parameter, extracts the `userId`, and verifies ownership.

#### `verifyQueryOwnership(userIdField)`

For routes that filter by `userId` in the query string. Forces the query to use the authenticated user's ID, preventing users from querying other users' data.

---

### `src/middleware/subscriptionAuth.js`

**Purpose:** Subscription-gated access control.

#### `requireActiveSubscription(req, res, next)`

Queries the `Subscription` collection for an active subscription (`active`, `trialing`, `past_due`, `paused`) that has not expired. Allows null `currentPeriodEnd` to support Stripe test mode and manual subscriptions.

On failure, provides detailed error context including the current status, whether it has expired, and an action URL to `/subscriptions`.

Attaches `req.subscription` for downstream use.

#### `optionalSubscriptionCheck(req, res, next)`

Non-blocking variant. Attaches `req.subscriptionInfo` with `hasSubscription`, `plan`, `expiresAt`, and `status`. Never blocks the request — useful for routes that adapt behaviour based on subscription without requiring one.

---

### `src/middleware/requestLogger.js`

**Purpose:** HTTP request/response logging with performance monitoring.

#### `generateRequestId() → string`

Produces a unique ID in the format `REQ_<timestamp>_<random>`.

#### `requestLogger(req, res, next)`

1. Assigns `req.id` with a unique request ID.
2. Records `req.startTime`.
3. Logs sensitive endpoint access (auth, users, medical documents).
4. Monkey-patches `res.json()` to:
   - Calculate response duration.
   - Log slow requests exceeding `SLOW_REQUEST_THRESHOLD_MS` (default: 2000ms).
   - Log all HTTP responses with method, path, duration, and status code.
   - Log security events for 401/403 responses.
   - Set the `X-Request-Id` response header.

---

### `src/middleware/sanitizeInput.js`

**Purpose:** XSS prevention via HTML sanitisation.

#### `sanitizeInput(req, res, next)`

Recursively sanitises `req.body` and `req.query` using `sanitize-html` with **all HTML tags stripped**. Applies an additional regex pass to catch `<script>` tags that may have survived.

Continues processing even on sanitisation errors to avoid breaking functionality.

#### `sanitizeStrict(fields) → middleware`

Targeted sanitisation for specific body fields. Returns 400 on errors rather than silently continuing.

---

### Other Middleware

#### `src/middleware/cacheControl.js`

Sets `Cache-Control` headers based on asset type:

| Asset Type | Cache Duration |
|------------|---------------|
| HTML files | No cache |
| CSS/JS files | 30 days (cache-busted by version param) |
| Images | 1 year |
| Fonts | 1 year |
| Service worker | No cache |
| Manifest | No cache |
| Default | No cache |

#### `src/middleware/corsConfig.js`

CORS configuration with an explicit origin whitelist: `jefitnessja.com`, `www.jefitnessja.com`, `localhost:10000`, `127.0.0.1:10000`. Null origins (same-origin, server-to-server, mobile) are allowed. Rejected origins are logged as security events.

Credentials are enabled, preflight is cached for 24 hours, and OPTIONS returns 204.

#### `src/middleware/dbConnection.js`

Provides `requireDbConnection` middleware that checks `mongoose.connection.readyState`. For connecting/disconnecting states, waits 1 second before rechecking. For auth routes during connecting state, returns 503 immediately. Also exports `isDbConnected()` and `getDbStatus()` utilities.

#### `src/middleware/versioning.js`

Sets the `X-API-Version: v1` response header and warns if the client sends an unsupported version header.

#### `src/middleware/securityHeaders.js`

Additional security headers beyond Helmet: `X-Content-Type-Options`, `X-XSS-Protection`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (disables camera, microphone, geolocation, USB), removes `X-Powered-By`, and sets HSTS in production. Disables caching for API responses.

#### `src/middleware/protectedRoute.js`

Factory for composing middleware chains. Provides pre-configured chains:

| Chain | Middleware Stack |
|-------|-----------------|
| `standard` | auth → dataConsent → dataRestriction → rateLimiter → versioning |
| `healthData` | standard + healthConsent |
| `admin` | same as standard |
| `basic` | auth → dataRestriction → rateLimiter → versioning (no consent) |
| `minimal` | auth → dataConsent → dataRestriction → versioning (no rate limiting) |

#### `src/middleware/requestValidator.js`

Provides reusable `express-validator` validation rule factories: `email()`, `password()`, `confirmPassword()`, `userId()`, `name()`, `phone()`, `url()`, `number()`, `date()`, `page()`, `limit()`, `search()`, `filter()`.

#### `src/middleware/apiKeyAuth.js`

API key authentication for machine-to-machine access. Extracts keys from `x-api-key` header or `Authorization: Bearer` header. Validates against the `APIKey` model and checks scope permissions.

---

## 5. Data Models

All models use Mongoose and are stored in `src/models/`.

### `User` (`src/models/User.js`)

The central model. Stores personal information, authentication data, fitness logs, consents, and compliance data.

**Subdocument Schemas:**

| Schema | Purpose |
|--------|---------|
| `MealFoodSchema` | Individual food item: name, calories, protein, carbs, fat, quantity, unit |
| `MealLogSchema` | A meal entry: date, mealType (breakfast/lunch/dinner/snack), foods array, totalCalories, notes, soft-delete |
| `WorkoutSetSchema` | Single set: setNumber, reps, weight, RPE (1-10), completed flag |
| `WorkoutExerciseSchema` | Exercise with multiple sets |
| `WorkoutLogSchema` | Complete workout: date, name, exercises, totalVolume (auto-calculated), duration, notes, soft-delete |

**Key Fields:**

| Field | Type | Notes |
|-------|------|-------|
| `firstName`, `lastName` | String | Required, trimmed, max 100 chars |
| `email` | String | Unique, lowercase, regex-validated |
| `password` | String | `select: false`, min 8 chars, bcrypt-hashed |
| `tokenVersion` | Number | `select: false`, incremented to invalidate all JWTs |
| `role` | String | `user` / `admin` / `trainer` |
| `isEmailVerified` | Boolean | Must be true before login is allowed |
| `stripeCustomerId` | String | Unique, sparse index |
| `workoutLogs` | [WorkoutLogSchema] | Embedded subdocuments |
| `mealLogs` | [MealLogSchema] | Embedded subdocuments |
| `dataProcessingConsent` | Object | GDPR: given, givenAt, version, IP, User-Agent |
| `healthDataConsent` | Object | GDPR: given, givenAt, purpose, version, IP, User-Agent |
| `marketingConsent` | Object | GDPR: given, givenAt, withdrawnAt, version, IP, User-Agent |
| `dataSubjectRights` | Object | GDPR Articles 15-21 request tracking |
| `twoFactorSecret`, `twoFactorEnabled`, `twoFactorBackupCodes` | Mixed | TOTP 2FA support |
| `medicalDocuments` | Array | Uploaded file metadata |
| `measurements` | Array | Body measurements history |
| `workoutGoals` | Array | Exercise goal tracking with achievement dates |

**Hooks:**
- `pre('save')` on UserSchema: hashes password with bcrypt (salt rounds: 10) if modified.
- `pre('save')` on WorkoutLogSchema: auto-calculates `totalVolume` as the sum of (reps * weight) across all sets.

**Methods:**
- `comparePassword(candidate)` — bcrypt comparison.
- `getActiveSubscription()` — lazy-loads the `Subscription` model and finds an active subscription for the user. Does not filter on `currentPeriodEnd` to avoid false negatives from stale dates.
- `hasActiveSubscription()` — boolean wrapper.
- `getSubscriptionInfo()` — returns a display-ready object with plan name and expiry.

**Indexes:** `role`, `createdAt`, `assignedTrainerId`, `assignedPrograms.programId`, `purchasedPrograms.programId`, `workoutLogs.date`, `workoutLogs.exercises.exerciseName`, `mealLogs.date`.

---

### `Subscription` (`src/models/Subscription.js`)

Mirrors Stripe subscription state. One document per Stripe subscription — there is no free tier document.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId | References `User`, indexed |
| `stripeCustomerId` | String | Indexed |
| `stripeSubscriptionId` | String | Unique, indexed |
| `plan` | String | Enum: `1-month`, `3-month`, `6-month`, `12-month` |
| `stripePriceId` | String | Required |
| `currentPeriodStart`, `currentPeriodEnd` | Date | UTC, indexed |
| `status` | String | Enum: all Stripe subscription statuses |
| `canceledAt` | Date | When cancellation was initiated |
| `cancelAtPeriodEnd` | Boolean | Whether to cancel at period end |
| `amount` | Number | In cents |
| `currency` | String | Default: `jmd` |
| `billingEnvironment` | String | `test` or `production` |
| `statusHistory` | Array | Timestamped status change log |

**Hooks:** `pre('save')` — if `status` is modified, pushes a new entry to `statusHistory`.

**Compound Index:** `{ userId: 1, status: 1, currentPeriodEnd: -1 }` for fast active subscription lookups.

---

### `Appointment` (`src/models/Appointment.js`)

Tracks client-trainer appointments.

| Field | Type | Notes |
|-------|------|-------|
| `clientId` | ObjectId | References `User` |
| `trainerId` | ObjectId | References `User`, required |
| `date` | Date | Required |
| `time` | String | Required (e.g. "09:00") |
| `status` | String | Enum: `scheduled`, `completed`, `cancelled`, `no_show`, `late` |
| `notes` | String | Optional |

**Indexes:** Comprehensive indexing for all query patterns — date+time, trainerId+date, clientId+date, status+date.

**Unique Constraint:** Partial unique index on `{trainerId, date, time}` where `status !== 'cancelled'` — prevents double-booking while allowing rebooking of cancelled slots.

---

### `StripePlan` (`src/models/StripePlan.js`)

Cached Stripe price/product data, populated by `npm run sync:plans`.

| Field | Type | Notes |
|-------|------|-------|
| `stripePriceId` | String | Unique, indexed |
| `stripeProductId` | String | Indexed |
| `name` | String | Product name |
| `lookupKey` | String | Indexed, for plan resolution |
| `unitAmount` | Number | Price in smallest currency unit |
| `currency` | String | Required |
| `interval` | String | `month` or `year` |
| `intervalCount` | Number | e.g. 3 for quarterly |
| `active` | Boolean | Indexed |
| `type` | String | `recurring` or `one_time` |
| `lastSyncedAt` | Date | Indexed |

---

### `Log` (`src/models/Log.js`)

Application log entries persisted to MongoDB by the logger service.

| Field | Type | Notes |
|-------|------|-------|
| `timestamp` | Date | Default: `Date.now` |
| `level` | String | `error`, `warn`, `info`, `http`, `debug` |
| `category` | String | `general`, `admin`, `user`, `security`, `auth` |
| `message` | String | Human-readable log message |
| `action` | String | Structured action name |
| `displayTimestamp` | String | Human-readable timestamp |
| `userId` | ObjectId | Who triggered the event |
| `ip`, `userAgent`, `requestId` | String | Request context |
| `metadata` | Mixed | Arbitrary structured data |

**Static Methods:**
- `cleanOldLogs(daysToKeep = 90)` — deletes logs older than N days.
- `getLogStats(startDate, endDate)` — aggregation pipeline that groups by level, category, and date.

---

### `WebhookEvent` (`src/models/WebhookEvent.js`)

Replay protection for Stripe webhooks. Each processed event ID is stored with a 24-hour TTL.

| Field | Type | Notes |
|-------|------|-------|
| `eventId` | String | Unique, indexed — Stripe event ID |
| `eventType` | String | e.g. `customer.subscription.created` |
| `processedAt` | Date | When first processed |
| `expiresAt` | Date | TTL index for auto-deletion after 24 hours |

**Method:** `ensureProcessed()` — upsert that handles race conditions. If two server instances try to process the same event simultaneously, the second one gets the existing document instead of a duplicate key error.

---

### Other Models

#### `Notification` (`src/models/Notification.js`)

System notifications with broadcast support. Tracks sender, recipients, read status, type (general-announcement, admin-alert, appointment-reminder, workout-update), and priority levels.

#### `Purchase` (`src/models/Purchase.js`)

One-time purchase records with Stripe payment tracking. Stores items array, total amount, currency, and billing environment.

#### `TrainerAvailability` (`src/models/TrainerAvailability.js`)

Weekly availability windows for trainers. Each document represents one day of the week with start/end hours and slot capacity (default 6, max 50). Unique index on `{trainerId, dayOfWeek}`. Validates that `endHour > startHour`.

#### `UserActionLog` (`src/models/UserActionLog.js`)

GDPR-compliant audit trail. Records user actions with timestamps, IP addresses, User-Agents, and arbitrary detail objects. Provides static methods for pagination (`getUserLogs`), creation (`logAction`), and cleanup (`cleanOldLogs` — 365 days default).

---

## 6. Services

### `src/services/stripe.js`

Central Stripe integration service. All Stripe API calls go through this module.

**Lazy Initialisation:** `getStripe()` creates the Stripe instance only when first called and only if `STRIPE_SECRET_KEY` is set. This prevents errors in test environments.

**Price Caching:** `getPlanPricing()` caches plan data in memory with a 5-minute TTL to avoid hammering the database on every checkout.

#### Key Functions

| Function | Description |
|----------|-------------|
| `getStripe()` | Returns the lazily-initialised Stripe client instance |
| `getStripePlans()` | Fetches active recurring plans from the `StripePlan` collection |
| `getPriceIdForPlan(plan)` | Resolves a plan name (e.g. `'3-month'`) to a Stripe price ID via interval/intervalCount matching |
| `getPlanNameFromPriceId(priceId)` | Reverse lookup — maps a Stripe price ID to the internal plan name using `derivePlanName()` |
| `derivePlanName(planRecord)` | Derives the canonical plan name from interval/intervalCount: `year` → `12-month`, `month/1` → `1-month`, etc. |
| `getPlanPricing()` | Returns all active plan pricing with display formatting, cached for 5 minutes |
| `createOrRetrieveCustomer(email, paymentMethodId, metadata)` | Finds or creates a Stripe customer by email. Attaches payment method if provided |
| `createSubscription(customerId, plan)` | Creates a Stripe subscription with `allow_incomplete` payment behaviour |
| `getCustomerSubscriptions(customerId, status)` | Lists subscriptions for a customer, optionally filtered by status |
| `getSubscription(subscriptionId)` | Retrieves a single subscription with expanded invoice and payment method |
| `updateSubscription(subscriptionId, updates)` | Updates plan (with proration), payment method, or metadata |
| `cancelSubscription(subscriptionId, atPeriodEnd)` | Cancels immediately or at period end. Idempotent — treats "already canceled" as success |
| `resumeSubscription(subscriptionId)` | Removes `cancel_at_period_end` flag |
| `createCheckoutSession(customerId, plan, successUrl, cancelUrl)` | Creates a Stripe Checkout session. Validates the customer exists, resolves the price from cached plans, sets billing address collection to required |
| `getCheckoutSession(sessionId)` | Retrieves a completed checkout session with expanded payment intent and customer |
| `getAllActivePrices()` | Fetches all active recurring prices from Stripe with product details |
| `getAllProducts(activeOnly)` / `getProduct(productId)` | Product catalog functions with embedded price data |
| `getPaymentMethods(customerId)` / `deletePaymentMethod(id)` | Payment method management |
| `createPaymentIntent(customerId, amount, currency)` | Manual payment processing |
| `formatProductForFrontend(product)` / `formatProductsForFrontend(products)` | Transforms Stripe product data for frontend consumption |

---

### `src/services/email.js`

Transactional email via [Resend](https://resend.com). Gracefully skips emails if `RESEND_API_KEY` is not configured.

#### Core Function

**`sendEmail({ to, subject, html, text, attachments })`** — Sends via the Resend API. All other email functions call this.

#### Email Templates

| Function | Purpose | Key Data |
|----------|---------|----------|
| `sendPasswordReset(to, name, token)` | Password reset link | Tokenised URL, 1-hour expiry |
| `sendSubscriptionReminder(to, name, plan, daysLeft, date)` | Renewal reminder | Days until renewal, manage link |
| `sendEmailVerification(to, name, token)` | Email verification | Tokenised URL, 24-hour expiry |
| `sendTrainerDailySchedule(to, name, date, appointments)` | Daily trainer schedule | Table of client names and times |
| `sendAppointmentConfirmationClient(to, name, trainer, date, time, id, isoDate)` | Booking confirmation | Calendar links (Google Calendar URL + .ics attachment) |
| `sendAppointmentCancellationClient(to, name, trainer, date, time, id, isoDate)` | Cancellation notice | Calendar cancel event (.ics with METHOD:CANCEL) |

#### Calendar Integration

- **`buildIcs(opts)`** — Generates iCalendar (.ics) content for appointment events. Supports `REQUEST` (new/update) and `CANCEL` methods with sequence numbering.
- **`buildGcalUrl(opts)`** — Generates a Google Calendar "add event" URL.
- **`icsAttachment(content)`** — Wraps ICS content as a base64 Resend attachment.
- **`calendarButtonsHtml(gcalUrl)`** — Renders HTML buttons for Google Calendar and Apple/Outlook (.ics).

---

### `src/services/logger.js`

Centralised structured logging using Winston with dual output (files + database).

#### Class: `Logger`

**Transports:**
- **Error log** — daily rotating file (`logs/error-YYYY-MM-DD.log`), 10MB max, 30 days retention, gzipped.
- **Combined log** — daily rotating file (`logs/combined-YYYY-MM-DD.log`), 20MB max, 30 days retention, gzipped.
- **Console** — colorised simple format in development, JSON format in production.

**Log Levels:** `error`, `warn`, `info`, `http`, `debug` (configurable via `LOG_LEVEL` env var).

Each log call (`info`, `warn`, `error`, `debug`, `http`) writes to Winston **and** asynchronously persists to the `Log` MongoDB collection. Database logging is fire-and-forget — failures are silently caught to prevent cascading errors.

#### Convenience Methods

| Method | Purpose |
|--------|---------|
| `logUserAction(action, userId, details, req)` | Structured user action logging with category `user` |
| `logAdminAction(action, adminId, details)` | Structured admin action logging with category `admin` |
| `logSecurityEvent(eventType, userId, details, req)` | Security event with severity classification. Critical events trigger additional error logging |

#### `_buildHumanMessage(action, details)`

Maps structured action names to human-readable messages. Handles: appointment booking/cancellation/deletion, consent events, GDPR data subject rights requests, data breach notifications. Falls back to replacing underscores with spaces for unknown actions.

**Exported as singleton** with convenience aliases: `logger`, `logError`, `logWarn`, `logInfo`, `logUserAction`, `logAdminAction`, `logSecurityEvent`.

---

### `src/services/cache.js`

In-memory cache service using JavaScript `Map`. No Redis dependency.

#### Class: `CacheService`

| Method | Description |
|--------|-------------|
| `connect()` | Starts the cleanup interval |
| `get(key)` | Returns cached value or null if expired/missing |
| `set(key, value, ttl)` | Stores with TTL in seconds (default: 1 hour) |
| `del(key)` | Deletes a single key |
| `invalidatePattern(pattern)` | Deletes all keys matching a glob pattern (converted to regex) |
| `clear()` | Flushes all entries |
| `getStats()` | Returns entry count |
| `stop()` | Clears the cleanup interval |

Cleanup runs every 60 seconds, removing expired entries.

**Exported as singleton.**

---

### `src/services/monitoring.js`

System health monitoring, performance tracking, and GDPR data breach detection.

#### Class: `MonitoringService`

**Metrics tracked:** request count, error count, response times (rolling window of 1000), uptime, memory usage, system load.

**Periodic tasks:**
- System metrics update: every 30 seconds
- Performance summary log: every 5 minutes
- Alert check: every 60 seconds

**Alert conditions:**
- Error rate > 5%
- System load > CPU count

#### Data Breach Detection

`recordSecurityEvent(event, details)` checks for breach indicators: `unauthorized_access`, `data_breach`, `mass_data_export`, `suspicious_activity`, `encryption_key_compromised`, `bulk_data_deletion`.

On detection, triggers:
1. **Containment** — logs specific response actions based on event type.
2. **Notification** — sends to compliance webhook if configured, notifies supervisory authority if high-risk.
3. **Compliance logging** — records in the compliance system.
4. **Risk assessment** — classifies as high (health data or >100 users), medium (personal/payment data), or low.

---

### `src/services/compliance.js`

GDPR/HIPAA compliance operations.

#### Class: `ComplianceService`

| Method | GDPR Article | Description |
|--------|-------------|-------------|
| `getConsentStatus(userId)` | — | Returns all three consent statuses |
| `grantDataProcessingConsent(userId, ip, ua)` | — | Records consent with audit trail |
| `grantHealthDataConsent(userId, purpose, ip, ua)` | — | Records with purpose enum |
| `grantMarketingConsent(userId, ip, ua)` | — | Records, clears any previous withdrawal |
| `withdrawMarketingConsent(userId, ip, ua)` | — | Sets `withdrawnAt` timestamp |
| `withdrawConsent(userId, type, ip, ua)` | — | Generic withdrawal by consent type |
| `requestDataAccess(userId, ip, ua)` | Art. 15 | Right of Access |
| `requestDataRectification(userId, data, ip, ua)` | Art. 16 | Right to Rectification |
| `requestDataErasure(userId, reason, ip, ua)` | Art. 17 | Right to Erasure / Right to be Forgotten |
| `requestDataPortability(userId, ip, ua)` | Art. 20 | Right to Data Portability |
| `objectToProcessing(userId, reason, ip, ua)` | Art. 21 | Right to Object |
| `requestProcessingRestriction(userId, reason, ip, ua)` | Art. 18 | Right to Restriction |
| `performDataRetentionCleanup()` | — | Anonymises users inactive for 7+ years without active consents |
| `logDataBreach(breachId, event, details)` | Art. 33/34 | Logs breach in audit trails of affected users |

All methods create audit log entries in both `UserActionLog` and the application logger.

---

### Other Services

#### `src/services/subscriptionExpiry.js`

Legacy subscription expiry service that operates on the `User` model directly. Provides `checkExpiredSubscriptions()`, `checkPastDueSubscriptions()`, and `runSubscriptionMaintenance()`. This is superseded by the `startSubscriptionCleanupJob()` in `jobs.js` which operates on the `Subscription` model.

#### `src/services/jobQueue.js` / `src/services/jobProcessors.js`

**Stub implementations.** Previously used Bull/Redis for async job processing. All methods are no-ops that log warnings. Retained for API compatibility.

---

## 7. Routes & Controllers

### Route Registration Summary

**Unprotected routes** (no auth middleware):
- `GET /api/v1/subscriptions/plans`
- `POST /api/v1/auth/*` (signup, login, etc.)
- `GET /api/v1/plans`

**Protected routes** (full middleware stack: auth → consent → restriction → rateLimiter → versioning):
- `/api/v1/clients`, `/api/v1/logs`, `/api/v1/appointments`, `/api/v1/users`
- `/api/v1/medical-documents`, `/api/v1/trainer`, `/api/v1/gdpr`
- `/api/v1/workouts`, `/api/v1/nutrition` (these also include health consent)

### Auth Routes (`src/routes/auth.js`)

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/signup` | signupLimiter, validators | Creates user, sends verification email |
| POST | `/login` | authLimiter | Validates credentials, checks 2FA, issues JWT |
| POST | `/logout` | auth | Increments token version |
| GET | `/me` | auth | Returns user profile (sans sensitive fields) |
| POST | `/consent` | auth | Grants data processing consent |
| GET | `/verify-email` | — | Verifies email token |
| POST | `/resend-verification` | authLimiter | Resends verification email |
| POST | `/check-verification` | verificationPollLimiter | Polls verification status |
| POST | `/forgot-password` | passwordResetLimiter | Sends reset email (no email enumeration) |
| POST | `/reset-password` | — | Resets password with token |
| POST | `/2fa/setup` | auth | Generates TOTP secret and QR code |
| POST | `/2fa/verify` | auth | Verifies TOTP and enables 2FA |
| POST | `/2fa/disable` | auth | Disables 2FA with password verification |
| POST | `/2fa/authenticate` | authLimiter | Completes 2FA login |

### Subscription Routes (`src/routes/subscriptions.js`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/plans` | No | Returns available plans from StripePlan DB |
| POST | `/checkout` | Yes | Creates Stripe Checkout session |
| GET | `/current` | Yes | Returns active subscription with days left |
| POST | `/verify-session/:sessionId` | Yes | Verifies checkout, upserts Subscription |
| POST | `/cancel/:subscriptionId` | Yes | Cancels subscription (at period end) |
| GET | `/refresh` | Yes | Re-syncs subscription state from Stripe |
| GET | `/:subscriptionId/invoices` | Yes | Lists invoices from Stripe |

### Appointment Routes (`src/routes/appointments.js`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/` | Admin | Paginated list with aggregation |
| GET | `/user` | Yes | User's appointments (as client or trainer) |
| GET | `/:id` | Yes | Single appointment (participant or admin) |
| POST | `/` | Yes + subscription | Book appointment (validates availability) |
| PUT | `/:id` | Yes | Update (role-restricted status transitions) |
| DELETE | `/:id` | Yes | Delete (participant or admin) |

### Client Routes (`src/routes/clients.js`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/` | Admin | Search, filter, sort, paginate clients |
| GET | `/statistics` | Admin | Aggregate client counts by status |
| GET | `/:id` | Admin | Detailed client profile with subscription |
| DELETE | `/:id` | Admin | Delete client |

### Trainer Routes (`src/routes/trainer.js`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/me` | Trainer | Trainer's own info |
| GET | `/dashboard` | Trainer | Dashboard with stats |
| GET | `/clients` | Trainer | Client list |
| GET | `/appointments` | Trainer | All trainer appointments |
| PUT | `/appointments/:id` | Trainer | Update appointment status |
| POST | `/appointments/bulk-update` | Trainer | Bulk status updates |
| GET | `/client/:clientId` | Trainer | Detailed client info |
| GET | `/:id/availability` | Yes | Get availability slots |
| PUT | `/availability` | Trainer | Set weekly availability |
| PUT | `/notification-preference` | Trainer | Email preference |

### Webhook Routes (`src/routes/webhooks.js`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/stripe` | Stripe signature | Processes Stripe events |
| POST | `/` | Stripe signature | Alternate path for CLI |

Uses raw body parsing for Stripe signature verification. Replay protection via `WebhookEvent` model. Handles all subscription lifecycle events and syncs state to MongoDB.

### Other Routes

- **Admin API** (`/api/v1/admin`) — Revenue, client profiles, bulk delete, subscription creation.
- **Admin Dashboard** (`/admin`) — Serves `admin.html` with auth + admin check.
- **Logs** (`/api/v1/logs`) — Query, stats, CSV export. Admin only.
- **GDPR** (`/api/v1/gdpr`) — 13 endpoints for consent management and data subject rights.
- **Medical Documents** (`/api/v1/medical-documents`) — Upload (Multer, 5MB limit), download, view, delete.
- **Nutrition** (`/api/v1/nutrition`) — Meal logging, history, daily stats, summary.
- **Workouts** (`/api/v1/workouts`) — Workout logging, progress tracking, goal management.
- **Users** (`/api/v1/users`) — Trainer/admin listing, profile management.
- **Plans** (`/api/v1/plans`) — Public plan catalog from StripePlan DB.
- **Cache** — Cache version hashes and diagnostics.

---

## 8. Utilities

### `src/utils/dateUtils.js`

All subscription date calculations must use this module — never raw `Date.now() + N * 86400000`.

| Function | Description |
|----------|-------------|
| `calculateSubscriptionEndDate(plan, startDate)` | Calculates end date using proper calendar arithmetic |
| `addMonths(date, months)` | Adds months, handling month-length overflow (Jan 31 + 1 month = Feb 28, not Mar 3) |
| `addYears(date, years)` | Adds years, handling leap year overflow (Feb 29 + 1 year = Feb 28) |
| `daysBetween(start, end)` | Midnight-normalised day difference (DST-safe) |
| `calculateNextRenewalDate(periodEnd, interval, intervalCount)` | Mirrors Stripe's billing cycle advancement using interval/intervalCount |
| `daysLeftUntil(periodEnd)` | Days remaining, clamped to 0 |

### `src/utils/validators.js`

Shared validation utilities usable on both client and server (conditional `module.exports`).

| Function | Description |
|----------|-------------|
| `validateEmail(email)` | Regex validation: `{valid, error}` |
| `validatePassword(password)` | Minimum length check |
| `validatePasswordStrength(password)` | Full strength check: uppercase, lowercase, numbers, special chars, min 8 |
| `validateName(name, fieldName)` | Minimum 2 chars, trimmed |
| `validateConfirmPassword(pw, confirm)` | Match check |

### `src/utils/cacheVersion.js`

Static asset cache busting.

| Function | Description |
|----------|-------------|
| `getFileHash(filePath)` | MD5 hash (first 8 chars) of file contents, cached in memory |
| `getVersionParam(filePath)` | Returns `?v=<hash>` |
| `versionedUrl(url)` | Appends version param to local URLs, skips external |
| `invalidateCache()` | Clears the hash cache |
| `startFileWatching(callback)` | Watches `js/` and `styles/` in development, invalidates on change |
| `stopFileWatching()` | Closes all file watchers |

### `src/utils/apiError.js`

Factory function: `apiError(message, statusCode = 400)` creates an `Error` with a `statusCode` property for the error handler.

---

## 9. Cron Jobs & Background Tasks

| Job | Schedule | Module | Description |
|-----|----------|--------|-------------|
| Unverified account cleanup | `*/30 * * * *` (every 30 min) | `server.js` | Deletes users with `isEmailVerified: false` older than `CLEANUP_TIME` minutes |
| Subscription cleanup | `0 0 * * *` (midnight) | `jobs.js` | Verifies expired subscriptions with Stripe before cancelling |
| Renewal reminders | `0 8 * * *` (8 AM) | `jobs.js` | Emails users 3 and 7 days before renewal |
| Trainer daily schedule | `0 0 * * *` (midnight) | `jobs.js` | Sends daily appointment digest to trainers |
| Self-ping | Every 10 minutes | `server.js` | Production only — prevents server sleep on free hosting |

---

## 10. Frontend Architecture

The frontend is a **multi-page application** with no build step for JavaScript. Each HTML page in `public/pages/` loads the scripts it needs via `<script>` tags. All pages share common infrastructure modules.

### Script Loading Order

Every protected page loads scripts in this order:
1. `api.config.js` — establishes `window.ApiConfig` and `window.API`
2. `auth-cache.js` — must load after `api.config.js`
3. `cache-version.js` — static asset versioning
4. `toast.js` — notification system
5. `validators.js` — form validation
6. `navbar-subscription.js` — subscription badge
7. `logout.js` — logout button handler
8. `role-guard.js` — access control
9. Page-specific JavaScript file(s)

### API Communication Pattern

All API calls go through `window.API.request(endpoint, options)` from `api.config.js`, which:
1. Resolves the full URL using `API_BASE`
2. Sets `credentials: 'include'` for cookie-based auth
3. Includes the CSRF token from cookies if available
4. Handles non-OK responses by throwing structured errors

---

## 11. Frontend Core Modules

### `public/js/api.config.js`

**Purpose:** Central API configuration. Resolves the API base URL based on the hostname (production: `https://jefitnessja.com`, development: `http://localhost:10000`).

Exposes `window.ApiConfig.getAPI_BASE()` which all API-calling modules use. Never hardcode API URLs — always use this function.

Also provides `window.API.request()` as a unified fetch wrapper with error handling, and convenience methods for auth operations.

### `public/js/auth-cache.js`

**Purpose:** Singleton Promise cache for the `/api/v1/auth/me` endpoint.

`window.AuthCache.getMe()` fires a single fetch per page load. All callers share the same Promise, preventing multiple simultaneous requests to the auth endpoint during page initialisation. Resets on failure so the next call retries.

**Why this exists:** Multiple modules need user data on page load (role guard, navbar, dashboard, etc.). Without the cache, each would fire its own `/auth/me` request. The cache ensures exactly one request and returns the same data to all callers.

### `public/js/toast.js`

Bootstrap-based toast notification system. `window.ToastManager` provides `success()`, `error()`, `info()`, `warning()` methods. Also registers global error boundaries for uncaught exceptions and unhandled promise rejections — displays user-friendly error toasts instead of silent failures.

### `public/js/validators.js`

Client-side form validation. `window.Validators` provides validation functions (`validateEmail`, `validatePassword`, `validatePasswordStrength`, `validateName`, `validateConfirmPassword`) plus DOM helpers (`showFieldError`, `hideFieldError`) that toggle Bootstrap `is-invalid`/`is-valid` classes. Also provides `escapeHtml()` for XSS prevention in dynamic content.

### `public/js/role-guard.js`

Checks the user's role against the page's required role. Uses `AuthCache.getMe()` to verify the session and redirects to `/login` if unauthorised or to the appropriate dashboard if the role doesn't match.

### `public/js/cookie-consent.js`

GDPR cookie consent banner. `CookieConsentManager` displays a banner with checkboxes for data processing, marketing, and health data consent. Stores consent in `localStorage` and syncs with the backend via `/api/v1/gdpr/consent/*` endpoints.

### `public/js/navbar-subscription.js`

Loaded on every page. Fetches the current subscription status and renders a badge in the navbar (`#subscription-status-navbar`). Shows the plan name and status indicator.

### `public/js/auth.js`

Handles login, signup, forgot password, and reset password forms. Uses `Validators` for form validation with real-time feedback. Redirects users to role-appropriate dashboards after login. Supports a terms acceptance modal before signup.

### `public/js/app.js`

Service Worker registration, PWA install promotion, and offline detection. Creates dynamic banners for offline status and PWA installation. Includes a `PerformanceObserver` for monitoring navigation timing.

### `public/js/cache-version.js`

`CacheVersionManager` scans all `<link>` and `<script>` elements on the page and appends `?v=<hash>` version parameters. Sets up a `MutationObserver` to version dynamically added elements.

### `public/js/gym-tour.js`

Interactive onboarding spotlight tour. `GymTour.start()` highlights page elements with `[data-tour]` attributes one by one, with an animated spotlight overlay and positioned tooltips. Tracks completion in `localStorage`. `GymLoader` provides a loading screen with motivational messages.

---

## 12. Frontend Page Modules

### `public/js/dashboard.js` / `dashboard-init.js`

User dashboard. Loads subscription status and workout statistics in parallel. Displays a skeleton screen during loading, then reveals the real content with animation. Triggers the gym tour for first-time users via `dashboard-init.js`.

### `public/js/subscriptions.js`

Subscription plan selection and checkout. Fetches plans from the API, renders plan cards, and initiates Stripe Checkout via redirect. Handles the `?success=true&session_id=` return flow by verifying the session. Also manages cancellation with a confirmation modal, invoice listing, and subscription refresh.

### `public/js/view-subscription.js`

Detailed subscription view page. Displays subscription info, payment method details (with hover reveal), days remaining progress bar, and invoice history. Supports cancellation with confirmation.

### `public/js/profile.js`

User profile management. Loads and displays the user's profile form, handles updates, body measurements (list, add, delete), and password changes with validation.

### `public/js/onboarding.js`

Multi-step onboarding modal for new users. Three steps: goals/reason, demographics (gender, DOB, height, weight), and completion. Posts to `/api/v1/users/onboarding` and triggers the gym tour on completion.

### `public/js/appointments.js`

Appointment booking and management. Checks subscription status before allowing bookings. Loads available trainers and time slots, validates booking constraints (one per day, 1-day advance minimum), and handles CRUD operations with email notification context.

### `public/js/log-meal.js`

Dynamic meal logging form. Supports multiple food items per meal with USDA food search (debounced), auto-calculated macros per 100g scaled by quantity, and total calorie tracking.

### `public/js/log-workout.js`

Dynamic workout logging form. Supports multiple exercises with multiple sets per exercise. Each set tracks reps, weight, and optional RPE.

### `public/js/nutrition-history.js`

Meal history with filtering (date range, meal type), pagination, custom SVG calorie chart, and soft deletion. Displays summary statistics (total meals, average calories, total protein).

### `public/js/workout-progress.js`

Exercise progress tracking with Chart.js visualisations. Displays max weight and total volume over time for a selected exercise. Includes goal management (create, achieve, delete).

### `public/js/medical-documents.js`

Medical document upload with drag-and-drop, file type validation (PDF, DOC, DOCX, JPG, PNG), 5MB size limit, and upload progress. Also manages the medical conditions text field.

### `public/js/verify-email.js`

Email verification flow. Handles two entry paths: direct link with token (verifies immediately) and post-signup redirect (polls for verification status every few seconds). Supports resending the verification email.

### `public/js/trainer-dashboard.js`

Trainer portal. Displays appointment stats (completed, scheduled, cancelled, no-show, late), client list, and appointment management. Supports status updates and bulk operations.

### `public/js/client-profile.js`

Admin/trainer view of an individual client. Tab-based layout with sections: overview, workouts, nutrition, programs, appointments, medical, GDPR. Fetches from different endpoints based on the viewer's role (admin vs trainer).

### `public/js/bmi.js`

Standalone BMI calculator. Takes height (feet/inches) and weight (pounds), calculates BMI, and displays the category.

---

## 13. Frontend Service Layer

### `public/js/services/SubscriptionService.js`

Thin fetch wrapper for subscription API calls. Methods: `getPlans()`, `getCurrentSubscription()`, `createCheckout(planId)`, `cancelSubscription(id, atPeriodEnd)`, `verifySession(sessionId)`.

### `public/js/services/AppointmentService.js`

Thin fetch wrapper for appointment API calls. Methods: `getAll()`, `getById(id)`, `create(data)`, `update(id, fields)`, `remove(id)`.

### `public/js/services/WorkoutService.js`

Thin fetch wrapper for workout API calls. Methods: `log(data)`, `getAll(params)`, `getProgress(exercise)`, `getSummary()`, `remove(id)`, `getGoals()`, `addGoal(data)`, `achieveGoal(id)`, `deleteGoal(id)`.

All service modules use `window.ApiConfig.getAPI_BASE()` and return parsed JSON responses.

---

## 14. Admin Module

The admin interface is a modular single-view architecture within the admin HTML page, with client-side routing between views.

### `public/js/admin/index.js`

Entry point for the admin dashboard. Verifies admin role via `AuthCache.getMe()`, sets up the topbar (date, title, initials), and implements a `navigateTo(viewKey)` router that renders views into `#view-container`. The `VIEWS` object maps view names to their render/destroy functions.

### Views

#### `public/js/admin/views/overview.js`

Dashboard home. Displays stat cards (total clients, active, inactive, revenue), a recent clients table, and a live log feed that polls every 15 seconds. Revenue is fetched from `/api/v1/admin/revenue`.

#### `public/js/admin/views/clients.js`

Client management table with search, pagination, bulk selection, and bulk deletion. Each row shows client name, email, subscription status, activity status, and actions (view, assign subscription, delete). Integrates the client modal and subscription modal components.

#### `public/js/admin/views/logs.js`

Advanced log viewer with level/category filtering (pill-based), date range selection, keyword search, live mode (auto-refresh), pagination, and CSV export. Renders log entries with colour-coded level badges.

### Components

#### `public/js/admin/components/client-modal.js`

Quick-view modal for client profiles. `AdminClientModal.open(clientId)` fetches the client profile from the appropriate endpoint (admin vs trainer) and renders a detailed overlay with subscription status, activity badge, and days remaining.

#### `public/js/admin/components/subscription-modal.js`

Subscription assignment modal. `AdminSubModal.open({ userId, name, email, onSuccess })` displays a plan selection grid, supports custom duration override, and creates the subscription via `POST /api/v1/admin/subscriptions`. Also supports `openBulk(userIds, onSuccess)` for bulk subscription assignment.

---

## 15. Testing

### Jest Configuration

Two projects in `jest.config.js`:
- **`backend`** — Node environment, matches `src/tests/unit/**/*.test.js`
- **`frontend`** — jsdom environment, matches `public/tests/unit/**/*.test.js`

### Backend Tests

- **Setup:** `src/tests/unit/setup.js`
- **Shared mocks:** `src/tests/unit/mocks.js`
- Test files: `adminController.test.js`, `dateUtils.test.js`, `email.test.js`, `logs.test.js`, `subscriptionDaysLeft.test.js`, `webhooks.test.js`

### Frontend Tests

- **Setup:** `public/tests/setup-jsdom.js` (jsdom environment)
- Located in `public/tests/unit/`

### E2E Tests

Cypress tests in `cypress/e2e/`: `appointments.cy.js`, `authentication.cy.js`, `basic-site-availability.cy.js`, `error-handling.cy.js`, `forms-input.cy.js`, `navigation.cy.js`, `responsiveness.cy.js`

### Stress Tests

`src/tests/stress/stress-test.js` — load testing with `src/tests/stress/cleanup.js` for teardown.

### Commands

```bash
npm test                    # Run all tests
npm run test:unit           # Backend unit tests only
npm run test:frontend       # Frontend unit tests only
npm run test:coverage       # Tests with coverage report
npm run test:stress         # Stress tests
npx jest <path>             # Single test file
```

---

## 16. Scripts & Tooling

### `scripts/sync-stripe-to-db.js`

Fetches all active recurring prices from Stripe and upserts them into the `StripePlan` MongoDB collection. Run via `npm run sync:plans`. Must be run after creating or modifying Stripe prices to keep the local database in sync.

### `scripts/cli-commands.js`

CLI interface for plan management. `npm run sync:plans` triggers the sync; `npm run list:plans` displays current plans.

### `scripts/assign-subscription.js`

Utility script for manually assigning subscriptions to users.

### Build & Development

```bash
npm run dev              # Start backend with Nodemon hot-reload
npm run dev:frontend     # Start BrowserSync on port 5500
npm run dev:full         # Both concurrently
npm run build:css        # Tailwind CSS build with watch
npm run cache:bust       # Update asset cache hashes
npm run docs:jsdoc       # Generate JSDoc documentation
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier formatting
```

---

## 17. Security Model

### Authentication

- **JWT tokens** stored in httpOnly cookies (preferred) with fallback to Authorization header and x-auth-token.
- **Token versioning** — each user has a `tokenVersion` in the database. Incrementing it invalidates all existing tokens. Used after password changes and security events.
- **2FA support** — TOTP via `speakeasy` with QR code generation and backup codes.
- **Email verification required** — unverified accounts cannot log in.

### Authorisation

- **Role-based** — `user`, `trainer`, `admin` with role always refreshed from the database (never trusted from JWT).
- **Ownership verification** — generic IDOR protection middleware with support for direct ownership, model-based ownership, and query-based ownership.
- **Subscription gating** — certain features require an active subscription.

### Input Security

- **XSS prevention** — all input sanitised via `sanitize-html` (all tags stripped).
- **NoSQL injection prevention** — recursive inspection for MongoDB operators in body and query.
- **Dangerous field stripping** — blacklist of fields that could enable privilege escalation.
- **Whitelist field filtering** — routes can declare exactly which fields are allowed.
- **Body size limits** — 10KB JSON limit.

### Network Security

- **CORS** — explicit origin whitelist, no wildcards in production.
- **CSP** — strict Content Security Policy with per-request nonces.
- **CSRF** — single-use tokens for non-JWT requests.
- **Rate limiting** — identity-aware (user > email > IP) with per-endpoint limits.
- **Helmet** — comprehensive HTTP security headers.
- **HSTS** — 1 year with preload in production.

### Stripe Security

- **Webhook signature verification** — raw body parsing for accurate signatures.
- **Replay protection** — processed event IDs stored with 24-hour TTL.
- **Idempotent cancellation** — treats "already canceled" as success.
- **Customer validation** — verifies customer exists before checkout.

---

## 18. Subscription & Billing Flow

### Checkout Flow

1. User selects a plan on the subscriptions page.
2. Frontend calls `POST /api/v1/subscriptions/checkout` with the plan key.
3. Backend creates/retrieves the Stripe customer, resolves the price ID from `StripePlan` DB, creates a Checkout session.
4. Frontend redirects to Stripe Checkout.
5. On success, Stripe redirects to `?success=true&session_id=cs_xxx`.
6. Frontend calls `POST /api/v1/subscriptions/verify-session/:sessionId`.
7. Backend retrieves the session from Stripe, upserts the `Subscription` document.

### Webhook Sync

Stripe sends webhook events for all subscription lifecycle changes. The handler:
1. Verifies the Stripe signature.
2. Checks replay protection.
3. Validates the event type against the whitelist.
4. Upserts the `Subscription` document with current Stripe data.
5. Updates the `User` document with `stripeCustomerId` and `stripeSubscriptionId`.

### Subscription Cleanup

The daily cron job finds subscriptions with `currentPeriodEnd` in the past, verifies each with Stripe:
- If Stripe says active → syncs dates from Stripe.
- If Stripe says inactive → marks as canceled.
- If Stripe is unreachable → skips (safe failure).

---

## 19. GDPR / Compliance

The application implements comprehensive GDPR compliance:

| Right | Article | Implementation |
|-------|---------|----------------|
| Right of Access | Art. 15 | `POST /api/v1/gdpr/data-access` |
| Right to Rectification | Art. 16 | `PUT /api/v1/gdpr/data-rectification` |
| Right to Erasure | Art. 17 | `DELETE /api/v1/gdpr/data-erasure` — anonymises user data |
| Right to Restriction | Art. 18 | `POST /api/v1/gdpr/restrict-processing` — blocks all data processing |
| Right to Portability | Art. 20 | `POST /api/v1/gdpr/data-portability` |
| Right to Object | Art. 21 | `POST /api/v1/gdpr/object-to-processing` |

**Consent Management:**
- Three consent types: data processing, health data, marketing.
- Each tracks: given flag, timestamp, version, IP address, User-Agent.
- Marketing consent tracks both grant and withdrawal dates.
- Admin users are exempt from consent requirements.

**Audit Trail:**
- All GDPR actions logged in `UserActionLog` with timestamps and IP addresses.
- Consent middleware logs verification events.

**Data Retention:**
- Automatic cleanup for users inactive 7+ years without active consents.
- Data anonymisation replaces personal fields with `[REDACTED]`.

**Data Breach:**
- Automatic detection of breach indicators in security events.
- Risk assessment (high/medium/low).
- Compliance webhook notification.
- Supervisory authority notification flag for high-risk breaches.
- Affected user audit trail entries.

---

## 20. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `RESEND_API_KEY` | No | Resend email API key (emails skipped if missing) |
| `USDA_API_KEY` | No | USDA food search API key (falls back to `DEMO_KEY`) |
| `PORT` | No | Server port (default: 10000) |
| `NODE_ENV` | No | Environment: `development`, `production`, `test` |
| `CLEANUP_TIME` | No | Minutes before deleting unverified accounts (default: 30) |
| `CRON_SCHEDULE` | No | Unverified account cleanup schedule (default: `*/30 * * * *`) |
| `SLOW_REQUEST_THRESHOLD_MS` | No | Slow request log threshold (default: 2000) |
| `LOG_LEVEL` | No | Winston log level (default: `info`) |
| `APP_URL` | No | Application URL for email links (default: `https://jefitnessja.com`) |
| `FROM_EMAIL` | No | Sender email address (default: `noreply@jefitnessja.com`) |
| `FROM_NAME` | No | Sender display name (default: `JE Fitness`) |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `ALERT_WEBHOOK_URL` | No | Webhook URL for system alerts |
| `COMPLIANCE_WEBHOOK_URL` | No | Webhook URL for data breach notifications |

---

*This documentation was generated from the source code as of April 2026. For the latest API documentation, visit `/api-docs` (Swagger UI) or `/redoc` in development mode.*
