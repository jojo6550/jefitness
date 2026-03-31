/**
 * Integration tests for GET /api/v1/subscriptions/current — daysLeft field.
 *
 * Verifies that the subscription countdown is computed correctly end-to-end:
 * controller → computeDaysLeft → daysLeftUntil (dateUtils).
 *
 * stripeService.getStripe is mocked to return null so the auto-heal path is
 * never triggered; tests exercise the normal read path only.
 */

const request = require('supertest');
const express = require('express');

// --------------------
// ENV
// --------------------
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';

// --------------------
// MOCKS (must be declared before any require() calls)
// --------------------
jest.mock('../../models/Subscription', () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../../services/stripe', () => ({
  // Return null so the auto-heal branch is skipped in all tests
  getStripe: jest.fn().mockReturnValue(null),
  getPlanPricing: jest.fn().mockResolvedValue([]),
  createOrRetrieveCustomer: jest.fn(),
  getPlanNameFromPriceId: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    req.user = { id: 'user_test_id' };
    next();
  },
}));

jest.mock('../../middleware/inputValidator', () => ({
  preventNoSQLInjection: (req, res, next) => next(),
  stripDangerousFields: (req, res, next) => next(),
  allowOnlyFields: () => (req, res, next) => next(),
  validateObjectId: jest.fn(),
  handleValidationErrors: (req, res, next) => next(),
  limitRequestSize: (req, res, next) => next(),
  validateSortParam: (req, res, next) => next(),
  validateAggregationPipeline: jest.fn(() => true),
}));

jest.mock('../../middleware/errorHandler', () => ({
  asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
  ValidationError: class ValidationError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
}));

// --------------------
// IMPORTS (after mocks)
// --------------------
const Subscription = require('../../models/Subscription');
const subscriptionRoute = require('../../routes/subscriptions');

// --------------------
// TEST APP
// --------------------
const app = express();
app.use(express.json());
app.use('/subscriptions', subscriptionRoute);
// Generic error handler so asyncHandler errors don't crash supertest
app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  res.status(err.statusCode || 500).json({ success: false, error: err.message });
});

// --------------------
// HELPERS
// --------------------

/**
 * Returns a Date at local midnight exactly `n` calendar days from today.
 * Uses setDate() for DST-safe arithmetic (mirrors daysBetween internals).
 */
function daysFromNow(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Builds a minimal mock Subscription document.
 * `toObject()` is required by the controller: `{ ...subscription.toObject(), daysLeft }`.
 */
function makeSub(overrides = {}) {
  const base = {
    _id: 'mongo_id_123',
    stripeSubscriptionId: 'sub_stripe_123',
    stripeCustomerId: 'cus_test',
    userId: 'user_test_id',
    status: 'active',
    plan: '1-month',
    stripePriceId: 'price_test',
    amount: 1800000,
    currency: 'jmd',
    billingEnvironment: 'test',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    currentPeriodStart: daysFromNow(0),
    currentPeriodEnd: daysFromNow(30),
    statusHistory: [],
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base }) };
}

/**
 * Makes Subscription.findOne return the given document for all calls.
 * Both the "active-first" query and the fallback query are covered.
 */
function mockFindOneReturning(sub) {
  Subscription.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(sub),
  });
}

// --------------------
// TESTS
// --------------------
describe('GET /subscriptions/current — daysLeft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns daysLeft: 30 for a subscription expiring in 30 days', async () => {
    mockFindOneReturning(makeSub({ currentPeriodEnd: daysFromNow(30) }));

    const res = await request(app).get('/subscriptions/current');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.daysLeft).toBe(30);
  });

  it('returns daysLeft: 0 for a subscription expiring today ("Renews Today")', async () => {
    mockFindOneReturning(makeSub({ currentPeriodEnd: daysFromNow(0) }));

    const res = await request(app).get('/subscriptions/current');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.daysLeft).toBe(0);
  });

  it('returns daysLeft: 0 for an expired subscription (clamped — never negative)', async () => {
    // Set stripeSubscriptionId to null so the auto-heal condition is false
    // (periodEndInvalid=true but stripeSubscriptionId is falsy → no Stripe call)
    mockFindOneReturning(
      makeSub({ currentPeriodEnd: daysFromNow(-1), stripeSubscriptionId: null })
    );

    const res = await request(app).get('/subscriptions/current');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.daysLeft).toBe(0);
  });

  it('returns daysLeft: 365 for a 12-month (annual) subscription', async () => {
    mockFindOneReturning(makeSub({ currentPeriodEnd: daysFromNow(365) }));

    const res = await request(app).get('/subscriptions/current');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.daysLeft).toBe(365);
  });

  it('returns data: null when no subscription exists', async () => {
    // Both the active-first query and the fallback query return null
    Subscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app).get('/subscriptions/current');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });

  it('includes the plan and status alongside daysLeft in the response', async () => {
    mockFindOneReturning(
      makeSub({ plan: '12-month', status: 'active', currentPeriodEnd: daysFromNow(365) })
    );

    const res = await request(app).get('/subscriptions/current');

    expect(res.body.data.plan).toBe('12-month');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.daysLeft).toBe(365);
  });
});

// --------------------
// CLEANUP
// --------------------
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
});
