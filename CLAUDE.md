# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start backend with hot-reload
npm run dev

# Start frontend with BrowserSync (separate terminal)
npm run dev:frontend

# Start both concurrently
npm run dev:full

# Run all tests
npm test

# Run only backend unit tests
npm run test:unit

# Run only frontend tests
npm run test:frontend

# Run tests with coverage
npm run test:coverage

# Build Tailwind CSS
npm run build:css

# Sync Stripe plans to MongoDB StripePlan collection
npm run sync:plans

# Seed fitness programs into DB
npm run seed:programs
```

## Architecture Overview

**Stack**: Express 5 backend serving static HTML/JS frontend + MongoDB + Stripe payments.

The app is **not** a SPA — it's a multi-page HTML app where each page (`public/pages/*.html`) loads its own JS file from `public/js/`. The backend serves these files statically and maps clean URLs (e.g. `/dashboard` → `/pages/dashboard.html`) in `src/server.js`.

### Backend (`src/`)

- **Entry**: `src/server.js` — Express app, MongoDB connect, middleware stack, route mounting, cron jobs
- **Routes** (`src/routes/`) → **Controllers** (`src/controllers/`) pattern; all routes are prefixed `/api/v1/`
- **Auth**: JWT-based (`src/middleware/auth.js`). Tokens stored in `localStorage` on the frontend and sent as `Authorization: Bearer <token>` headers
- **Stripe**: All Stripe logic goes through `src/services/stripe.js`. Subscription state is persisted to MongoDB (`Subscription` model) and synced from Stripe via webhooks (`src/routes/webhooks.js`) and on-demand via the `/refresh` endpoint
- **Date math**: All subscription date calculations (period end, days left, next renewal) must use `src/utils/dateUtils.js` — never raw `Date.now() + N * 86400000` arithmetic

### Frontend (`public/js/`)

- `api.config.js` — resolves `API_BASE` (localhost vs production). Always use `window.ApiConfig.getAPI_BASE()` for API calls, never hardcode URLs
- `services/SubscriptionService.js` — thin fetch wrapper for all subscription API calls
- `subscriptions.js` — main subscription page logic: loads plans, renders active subscription summary, handles checkout flow
- `navbar-subscription.js` — loaded on every page to show subscription badge in the navbar

### Subscription Flow

1. User selects plan → `subscriptions.js:selectPlan()` → POST `/api/v1/subscriptions/checkout` → Stripe Checkout redirect
2. On return: `?success=true&session_id=cs_xxx` → `verifyCheckoutSession` upserts the `Subscription` document from Stripe data
3. Stripe webhooks (`src/routes/webhooks.js`) keep the DB in sync for renewals, cancellations, etc.
4. `getCurrentSubscription` has an auto-heal path: if `currentPeriodEnd` is missing or stale for an active sub, it re-fetches from Stripe inline

### Key Models

- `Subscription` — one document per Stripe subscription; `currentPeriodStart`/`currentPeriodEnd` are stored as JS `Date` objects (UTC). The pre-save hook auto-cancels on Stripe when `status` is set to `'canceled'`
- `StripePlan` — cached Stripe price/product data, populated by `npm run sync:plans`
- `User` — stores `stripeCustomerId` and `stripeSubscriptionId` as denormalized references

### Environment

Copy `.env.example` to `.env`. Required variables: `MONGO_URI`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and all `STRIPE_PRODUCT_*` / `STRIPE_PRICE_*` keys for the four subscription tiers (`1-month`, `3-month`, `6-month`, `12-month`).

### Testing

- Jest config (`jest.config.js`) has two projects: `backend` (Node env) and `frontend` (jsdom)
- Backend tests live in `src/tests/unit/`, frontend tests in `public/tests/unit/`
- Integration/E2E: Cypress (`cypress/`)
