// ============================================
// STRIPE MOCK FUNCTIONS (MUST BE FIRST)
// ============================================

const mockCustomersUpdate = jest.fn();
const mockCustomersList = jest.fn().mockResolvedValue({ data: [] });
const mockCustomersCreate = jest.fn().mockResolvedValue({
  id: 'cus_test123',
  email: 'test@example.com'
});
const mockCustomersRetrieve = jest.fn().mockResolvedValue({
  id: 'cus_test123',
  email: 'test@example.com'
});

const mockSubscriptionsCreate = jest.fn().mockResolvedValue({
  id: 'sub_test123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000,
  items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
});

const mockSubscriptionsList = jest.fn().mockResolvedValue({
  data: [{
    id: 'sub_test123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 2592000
  }]
});

const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsDel = jest.fn();

const mockCheckoutSessionsCreate = jest.fn().mockResolvedValue({
  id: 'cs_test123',
  url: 'https://checkout.stripe.com/test123'
});

const mockInvoicesList = jest.fn().mockResolvedValue({ data: [] });
const mockPaymentMethodsList = jest.fn().mockResolvedValue({ data: [] });
const mockWebhooksConstructEvent = jest.fn();

const mockPricesList = jest.fn().mockResolvedValue({
  data: [{
    id: 'price_test123',
    product: 'prod_test123',
    unit_amount: 999,
    recurring: { interval: 'month' }
  }]
});

const mockPricesRetrieve = jest.fn().mockResolvedValue({
  id: 'price_test123',
  unit_amount: 999,
  currency: 'usd'
});

const mockProductsRetrieve = jest.fn().mockResolvedValue({
  id: 'prod_test123',
  name: 'Test Product'
});

// ============================================
// MOCK STRIPE SDK
// ============================================

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      update: mockCustomersUpdate,
      list: mockCustomersList,
      create: mockCustomersCreate,
      retrieve: mockCustomersRetrieve
    },
    subscriptions: {
      create: mockSubscriptionsCreate,
      list: mockSubscriptionsList,
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
      del: mockSubscriptionsDel
    },
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate
      }
    },
    invoices: {
      list: mockInvoicesList
    },
    paymentMethods: {
      list: mockPaymentMethodsList
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent
    },
    prices: {
      list: mockPricesList,
      retrieve: mockPricesRetrieve
    },
    products: {
      retrieve: mockProductsRetrieve
    }
  }));
});

// ============================================
// MOCK STRIPE SERVICE LAYER
// ============================================

jest.mock('../src/services/stripe', () => ({
  createOrRetrieveCustomer: jest.fn().mockResolvedValue({
    id: 'cus_test123',
    email: 'test@example.com'
  }),
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn().mockResolvedValue({
    id: 'sub_test123',
    status: 'canceled'
  }),
  resumeSubscription: jest.fn().mockResolvedValue({
    id: 'sub_test123',
    status: 'active'
  }),
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test123',
    url: 'https://checkout.stripe.com/test123'
  }),
  getPlanPricing: jest.fn().mockResolvedValue({
    '1-month': { amount: 999, currency: 'usd' },
    '3-month': { amount: 2799, currency: 'usd' },
    '6-month': { amount: 5199, currency: 'usd' },
    '12-month': { amount: 9599, currency: 'usd' }
  }),
  getPriceIdForProduct: jest.fn().mockResolvedValue('price_test123'),
  PRODUCT_IDS: {
    '1-month': 'prod_1month',
    '3-month': 'prod_3month',
    '6-month': 'prod_6month',
    '12-month': 'prod_12month'
  },
  PROGRAM_PRODUCT_IDS: {
    'prog_test123': 'prod_program123'
  }
}));

// ============================================
// IMPORTS (AFTER MOCKS)
// ============================================

const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const Program = require('../src/models/Program');
const app = require('../src/server');

// Mock mongoose models
jest.mock('../src/models/User');
jest.mock('../src/models/Subscription');
jest.mock('../src/models/Program');

// ============================================
// TEST SETUP
// ============================================

let testUser;
let authToken;

beforeEach(async () => {
  // Set JWT secret for tests
  process.env.JWT_SECRET = 'test_secret';

  jest.clearAllMocks();

  testUser = new User({
    _id: new mongoose.Types.ObjectId(),
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    isEmailVerified: true,
    role: 'user',
    dataProcessingConsent: { given: true },
    healthDataConsent: { given: true }
  });

  User.findById.mockResolvedValue(testUser);
  User.findOne.mockResolvedValue(null);
  User.prototype.save = jest.fn().mockResolvedValue(testUser);

  const jwt = require('jsonwebtoken');
  authToken = jwt.sign(
    { id: testUser._id, role: 'user' },
    process.env.JWT_SECRET
  );
});

afterEach(async () => {
  jest.clearAllMocks();
});

// ============================================
// TESTS
// ============================================

describe('Stripe Subscription System', () => {
  describe('GET /api/v1/subscriptions/plans', () => {
    it('returns available plans', async () => {
      const res = await request(app)
        .get('/api/v1/subscriptions/plans')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.plans).toBeDefined();
    });
  });

  describe('POST /api/v1/subscriptions/checkout-session', () => {
    it('requires authentication', async () => {
      await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .expect(401);
    });

    it('creates checkout session', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost/success',
          cancelUrl: 'http://localhost/cancel'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBeDefined();
    });
  });
});

describe('Stripe Webhook Handling', () => {
  it('handles checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test123',
          subscription: 'sub_test123',
          mode: 'subscription'
        }
      }
    };

    mockWebhooksConstructEvent.mockReturnValue(event);

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'test_sig')
      .send(event)
      .expect(200);

    expect(res.body.received).toBe(true);
  });
});
