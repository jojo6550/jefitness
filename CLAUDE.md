# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Branch Workflow Protocol

**All new feature work must happen on the `dev` branch, never directly on `main`.**

1. Before starting any feature: `git checkout dev && git pull origin dev`
2. Develop on `dev`
3. Once verified, merge to `main` (production): `git checkout main && git merge dev && git push origin main`

`main` = production. `dev` = staging/active development.

## Development Commands

```bash
# Start backend with hot-reload (nodemon watches src/ and public/)
npm run dev

# Start backend without reload
npm start

# Build Tailwind CSS (watch mode)
npm run build:css

# Run all tests (Jest projects: backend + integration + frontend)
npm test

# Single Jest project
npm run test:unit          # src/tests/unit
npm run test:integration   # src/tests/integration
npm run test:frontend      # public/tests/unit
npm run test:usage         # src/tests/usage
npm run test:coverage
npm run test:watch

# Run a single test file
npx jest src/tests/unit/dateUtils.test.js

# Stress tests (not Jest; standalone node script)
npm run test:stress

# Lint / format
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Stripe plan tooling
npm run sync:plans      # sync Stripe → StripePlan collection
npm run list:plans
npm run webhook:plans

# Bust static asset cache (updates hash used by service worker)
npm run cache:bust

# Cypress E2E (baseUrl = https://jefitnessja.com)
npx cypress open
npx cypress run
```

## Architecture Overview

**Stack:** Express 5 + MongoDB (Mongoose) + Stripe + vanilla JS frontend. CommonJS throughout.

**Not a SPA** — multi-page app. Each `public/pages/*.html` loads its own bundle from `public/js/`. The backend serves pages statically and rewrites clean URLs (e.g. `/dashboard` → `/pages/dashboard.html`) via a middleware in `src/server.js`. Two-segment paths like `/clients/:id` also resolve to the first-segment HTML file.

### Backend (`src/`)

- **Entry:** `src/server.js` — assembles Express, connects MongoDB, registers middleware and routes, starts cron jobs, handles graceful shutdown.
- **Routes → Controllers:** `src/routes/*.js` delegate to `src/controllers/*.js`. All API routes mount under `/api/v1/`.
- **Auth:** `src/middleware/auth.js`. JWT accepted from httpOnly cookie (preferred), `Authorization: Bearer`, or `x-auth-token`. Role re-fetched from DB on each request — never trust JWT claims for authorization.
- **Stripe:** Single facade at `src/services/stripe.js` re-exporting from `src/services/stripe/` submodules (client, pricing, customers, subscriptions, payments, checkout, products). Go through the facade.
- **Webhooks:** `src/routes/webhooks.js` mounted **before** body parsers in `server.js` — uses `express.raw()` internally so Stripe can verify the signed Buffer. Moving the mount below `express.json()` breaks `constructEvent()`.
- **Date math:** Subscription period/days-left calculations must use `src/utils/dateUtils.js`, not raw `Date.now() + N * 86400000`.
- **Error classes:** `src/middleware/errorHandler.js` exports `AppError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `DatabaseError` — prefer these over generic `Error`.
- **Email:** `src/services/email.js` (and `email/` submodules), `src/services/appointmentEmails.js`. Uses Resend + node-mailjet.
- **Config startup guard:** `validateConfig()` in `server.js` requires `JWT_SECRET`, `STRIPE_SECRET_KEY`, `MONGO_URI` — process exits otherwise.

### Route Protection

Unprotected (mounted in `server.js` `apiRoutes`): `/api/v1/subscriptions`, `/api/v1/auth`, `/api/v1/plans`.

Protected routes (`protectedRoutes`) apply: `auth` → `requireDataProcessingConsent` → (for health routes: `requireHealthDataConsent`) → `checkDataRestriction` → `apiLimiter` → `versioning`. Health consent applies to `/logs`, `/medical-documents`, `/workouts`, `/nutrition`.

Admin: `/admin` (HTML/page router) and `/api/v1/admin` (API) — auth and admin role enforced inside the router. `/api/v1/tickets` mounted separately.

### Frontend (`public/js/`)

- `api.config.js` — resolves `API_BASE` (localhost vs production). Always call `window.ApiConfig.getAPI_BASE()` — never hardcode URLs. Must load before any auth-dependent script.
- `auth/` and `auth.js` — auth forms split per-form (see recent `refactor: split auth.js into per-form modules`).
- `services/SubscriptionService.js` — thin fetch wrapper for subscription endpoints.
- `subscriptions/` — page split into plan/manager/checkout modules. `subscriptions.js` is the page entry.
- `appointments/` — page split into list/booking/edit modules.
- `navbar-subscription.js` — loaded on every page; renders subscription badge.
- `role-guard.js` — client-side role restriction on page load.
- Service worker: `public/sw.js`. Cache-bust via `npm run cache:bust` after static asset changes.

### Subscription Flow

1. User picks plan → `SubscriptionService` → POST `/api/v1/subscriptions/checkout` → Stripe Checkout redirect.
2. Return URL `?success=true&session_id=cs_xxx` → `verifyCheckoutSession` upserts the `Subscription` document from Stripe.
3. Webhooks (`src/routes/webhooks.js`) keep the DB synced for renewals/cancellations. Replay protection via `WebhookEvent` TTL.
4. `getCurrentSubscription` auto-heals: if `currentPeriodEnd` missing/stale for an active sub, re-fetches from Stripe inline.
5. Stripe is the source of truth. The cleanup cron always verifies with Stripe before marking `canceled`.

### Key Models (`src/models/`)

- `Subscription` — one doc per Stripe subscription. `currentPeriodStart/End` are JS `Date` (UTC). Pre-save hook auto-cancels on Stripe when `status` set to `'canceled'`.
- `StripePlan` — cached Stripe price/product data, populated by `npm run sync:plans` (also runs on server startup).
- `User` — stores `stripeCustomerId`, `stripeSubscriptionId`; embeds `MealLog[]` and `WorkoutLog[]` subdocs.
- `WebhookEvent` — persists processed Stripe event IDs with TTL for replay protection across restarts/instances.
- `Appointment`, `SupportTicket`, `TrainerAvailability`, `Log`, `UserActionLog`, `Purchase`.

### Cron Jobs (`src/jobs.js` + `server.js`)

- Unverified-account cleanup: `*/30 * * * *` (in `server.js`) — deletes users where `isEmailVerified=false` and older than `CLEANUP_TIME` minutes. Re-entrancy guarded.
- Subscription cleanup: `0 0 * * *` — verifies with Stripe before canceling; syncs period dates if Stripe still active.
- Renewal reminders: `0 8 * * *` — emails users 3 and 7 days before renewal; respects `privacySettings.marketingEmails`.
- Trainer daily schedule: `0 0 * * *` — daily appointment digest per trainer (opt-out via `trainerEmailPreference`).
- 10-minute appointment reminder: `startTenMinuteReminderJob()`.

### API Docs (non-production only)

- Swagger UI: `/api-docs`
- ReDoc: `/redoc`
- Raw spec: `/api-docs.json`

### Environment

`.env` required keys: `MONGO_URI`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus `STRIPE_PRODUCT_*` / `STRIPE_PRICE_*` for the four tiers (`1-month`, `3-month`, `6-month`, `12-month`). Optional: `USDA_API_KEY` (food search; falls back to `DEMO_KEY`), `CLEANUP_TIME` (default 30), `CRON_SCHEDULE`, `SLOW_REQUEST_THRESHOLD_MS`, `PORT` (default 10000).

## Testing

- `jest.config.js` defines three projects: `backend` (node, `src/tests/unit`), `integration` (node, `src/tests/integration`), `frontend` (jsdom, `public/tests/unit`).
- Backend setup: `src/tests/unit/setup.js`. Shared mocks: `src/tests/unit/mocks.js`.
- Frontend setup: `public/tests/setup-jsdom.js`.
- Integration DB: `mongodb-memory-server`.
- E2E: Cypress — `cypress/e2e/**/*.cy.js`, baseUrl `https://jefitnessja.com`.

## Lint / Format

ESLint flat config (`eslint.config.mjs`) with `eslint-plugin-n`, `import`, `promise`, Prettier integration. Prettier: single quotes, semis, 90 col, 2-space, no tabs, `trailingComma: es5`, `arrowParens: avoid`.
