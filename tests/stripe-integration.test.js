// tests/stripe-integration.test.js - Integration tests for complete Stripe flow
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const app = require('../src/server');
const { MongoMemoryServer } = require('mongodb-memory-server');

// -----------------------------
// Mock Stripe services
// -----------------------------
jest.mock('../src/services/stripe', () => ({
  PRICE_IDS: {
    '1-month': 'price_1month',
    '3-month': 'price_3month',
    '6-month': 'price_6month',
    '12-month': 'price_12month'
  },
  PLAN_PRICING: {
    '1-month': { amount: 999, currency: 'usd', duration: '1 month' },
    '3-month': { amount: 2997, currency: 'usd', duration: '3 months' },
    '6-month': { amount: 5994, currency: 'usd', duration: '6 months' },
    '12-month': { amount: 11988, currency: 'usd', duration: '12 months' }
  },
  createOrRetrieveCustomer: jest.fn().mockResolvedValue({
    id: 'cus_test123',
    email: 'test@example.com'
  }),
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test123',
    url: 'https://checkout.stripe.com/test123'
  }),
  createSubscription: jest.fn(),
  getCustomerSubscriptions: jest.fn(),
  getSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  resumeSubscription: jest.fn(),
  getSubscriptionInvoices: jest.fn(),
  getPaymentMethods: jest.fn()
}));

// -----------------------------
// Mock Stripe (inside jest.mock factory to avoid TDZ)
// -----------------------------
jest.mock('stripe', () => {
  const mockStripe = {
    customers: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockImplementation((params) =>
        Promise.resolve({
          id: 'cus_test123',
          email: params.email || 'test@example.com',
          metadata: params.metadata || {}
        })
      ),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      })
    },

    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
      }),
      list: jest.fn().mockResolvedValue({ data: [] }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
      }),
      update: jest.fn().mockImplementation((subscriptionId, updateData) => {
        // Handle different update scenarios
        if (updateData.cancel_at_period_end !== undefined) {
          return Promise.resolve({
            id: subscriptionId,
            status: updateData.cancel_at_period_end ? 'active' : 'active',
            cancel_at_period_end: updateData.cancel_at_period_end,
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
          });
        }
        // Default update response for plan changes
        return Promise.resolve({
          id: subscriptionId,
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          items: { data: [{ id: 'si_test123', price: { id: 'price_updated123' } }] }
        });
      }),
      del: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'canceled'
      })
    },

    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test123'
        })
      }
    },

    invoices: {
      list: jest.fn().mockResolvedValue({ data: [] })
    },

    webhooks: {
      constructEvent: jest.fn()
    }
  };

  return jest.fn(() => mockStripe);
});

// -----------------------------
// Tests
// -----------------------------
describe('Stripe Subscription Integration Tests', () => {
  
  describe('Complete Subscription Flow', () => {
    let authToken;
    let userId;

    beforeEach(async () => {
      // Create test user
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

      const user = new User({
        firstName: 'Integration',
        lastName: 'Test',
        email: `test-${Date.now()}@example.com`,
        password: hashedPassword,
        isEmailVerified: true,
        role: 'user'
      });

      await user.save();
      userId = user._id;

      // Generate token
      const jwt = require('jsonwebtoken');
      authToken = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET);
    });

    it('should complete full subscription flow: account → checkout → success', async () => {
      const accountRes = await request(app)
        .get('/api/v1/auth/account')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(accountRes.body.firstName).toBeDefined();
      expect(accountRes.body.email).toBeDefined();

      const plansRes = await request(app)
        .get('/api/v1/subscriptions/plans')
        .expect(200);

      expect(plansRes.body.success).toBe(true);
      expect(plansRes.body.data.plans['1-month']).toBeDefined();

      const checkoutRes = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(200);

      expect(checkoutRes.body.success).toBe(true);
      expect(checkoutRes.body.data.sessionId).toBe('cs_test123');
      expect(checkoutRes.body.data.url).toBeDefined();

      const { createOrRetrieveCustomer, createCheckoutSession } = require('../src/services/stripe');
      expect(createOrRetrieveCustomer).toHaveBeenCalled();
      expect(createCheckoutSession).toHaveBeenCalled();

      const updatedUser = await User.findById(userId);
      expect(updatedUser.stripeCustomerId).toBe('cus_test123');
    });

    it('should sync email changes to Stripe', async () => {
      const checkoutRes = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(200);

      const updateRes = await request(app)
        .put('/api/v1/auth/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: `updated-${Date.now()}@example.com`
        })
        .expect(200);

      expect(updateRes.body.user.email).toMatch(/updated-.*@example.com/);

      const stripe = require('stripe')();
      expect(stripe.customers.update).toHaveBeenCalled();
    });

    it('should handle subscription plan upgrade', async () => {
      const subscription = new Subscription({
        userId,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_test123',
        plan: '1-month',
        amount: 999,
        currency: 'usd',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      await subscription.save();

      let user = await User.findById(userId);
      user.subscriptionId = 'sub_test123';
      user.subscriptionStatus = 'active';
      user.subscriptionPlan = '1-month';
      user.stripeCustomerId = 'cus_test123';
      await user.save();

      const upgradeRes = await request(app)
        .post('/api/v1/subscriptions/sub_test123/update-plan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: '12-month' })
        .expect(200);

      expect(upgradeRes.body.success).toBe(true);
      expect(upgradeRes.body.data.subscription.plan).toBe('12-month');

      const stripe = require('stripe')();
      expect(stripe.subscriptions.update).toHaveBeenCalled();
    });

    it('should handle subscription cancellation with proper status', async () => {
      const subscription = new Subscription({
        userId,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_test123',
        plan: '1-month',
        amount: 999,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      await subscription.save();

      let user = await User.findById(userId);
      user.subscriptionId = 'sub_test123';
      user.subscriptionStatus = 'active';
      user.stripeCustomerId = 'cus_test123';
      await user.save();

      const cancelRes = await request(app)
        .delete('/api/v1/subscriptions/sub_test123/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ atPeriodEnd: true })
        .expect(200);

      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.subscription.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('Webhook Processing Flow', () => {
    it('should process checkout.session.completed webhook', async () => {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

      const user = new User({
        firstName: 'Webhook',
        lastName: 'Test',
        email: 'webhook@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        stripeCustomerId: 'cus_webhook123'
      });
      await user.save();

      const stripe = require('stripe')();

      const event = {
        type: 'checkout.session.completed',
        id: 'evt_test123',
        data: {
          object: {
            id: 'cs_test123',
            customer: 'cus_webhook123',
            subscription: 'sub_webhook123'
          }
        }
      };

      stripe.webhooks.constructEvent.mockReturnValue(event);

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });

  describe('Authentication & Security', () => {
    it('should reject unauthenticated subscription requests', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});

// Close DB connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});
