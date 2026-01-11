// tests/stripe-integration.test.js - Integration tests for complete Stripe flow
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const app = require('../src/server');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      }),
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
        status: 'active'
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active'
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
  }));
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

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
      // Step 1: Verify account has required fields
      const accountRes = await request(app)
        .get('/api/v1/auth/account')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(accountRes.body.firstName).toBeDefined();
      expect(accountRes.body.email).toBeDefined();

      // Step 2: Get available plans
      const plansRes = await request(app)
        .get('/api/v1/subscriptions/plans')
        .expect(200);

      expect(plansRes.body.success).toBe(true);
      expect(plansRes.body.data.plans['1-month']).toBeDefined();

      // Step 3: Create checkout session
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

      // Verify Stripe customer was created
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      expect(stripe.customers.create).toHaveBeenCalled();

      // Verify checkout session was created
      expect(stripe.checkout.sessions.create).toHaveBeenCalled();

      // Step 4: Check user has Stripe customer ID
      const updatedUser = await User.findById(userId);
      expect(updatedUser.stripeCustomerId).toBe('cus_test123');
    });

    it('should sync email changes to Stripe', async () => {
      // First create Stripe customer
      const checkoutRes = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(200);

      // Now update email
      const updateRes = await request(app)
        .put('/api/v1/auth/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: `updated-${Date.now()}@example.com`
        })
        .expect(200);

      expect(updateRes.body.user.email).toMatch(/updated-.*@example.com/);

      // Verify Stripe was updated
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      expect(stripe.customers.update).toHaveBeenCalled();
    });

    it('should handle subscription plan upgrade', async () => {
      // Create initial subscription
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

      // Update user with subscription
      let user = await User.findById(userId);
      user.subscriptionId = 'sub_test123';
      user.subscriptionStatus = 'active';
      user.subscriptionPlan = '1-month';
      user.stripeCustomerId = 'cus_test123';
      await user.save();

      // Upgrade to 12-month plan
      const upgradeRes = await request(app)
        .post('/api/v1/subscriptions/sub_test123/update-plan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '12-month'
        })
        .expect(200);

      expect(upgradeRes.body.success).toBe(true);
      expect(upgradeRes.body.data.subscription.plan).toBe('12-month');

      // Verify subscription was updated
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      expect(stripe.subscriptions.update).toHaveBeenCalled();
    });

    it('should handle subscription cancellation with proper status', async () => {
      // Create subscription
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

      // Update user
      let user = await User.findById(userId);
      user.subscriptionId = 'sub_test123';
      user.subscriptionStatus = 'active';
      user.stripeCustomerId = 'cus_test123';
      await user.save();

      // Cancel at period end
      const cancelRes = await request(app)
        .delete('/api/v1/subscriptions/sub_test123/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          atPeriodEnd: true
        })
        .expect(200);

      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.subscription.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('Webhook Processing Flow', () => {
    
    it('should process checkout.session.completed webhook', async () => {
      // Create user for webhook
      const user = new User({
        firstName: 'Webhook',
        lastName: 'Test',
        email: 'webhook@example.com',
        password: 'hashed',
        isEmailVerified: true,
        stripeCustomerId: 'cus_webhook123'
      });
      await user.save();

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'test_secret';

      // Mock the event
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

      // Send webhook
      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should handle multiple webhook events in sequence', async () => {
      const user = new User({
        firstName: 'Sequential',
        lastName: 'Test',
        email: 'sequential@example.com',
        password: 'hashed',
        stripeCustomerId: 'cus_seq123'
      });
      await user.save();

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      // Event 1: Subscription created
      const event1 = {
        type: 'customer.subscription.created',
        id: 'evt_seq1',
        data: {
          object: {
            id: 'sub_seq123',
            customer: 'cus_seq123',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: { data: [{ price: { id: 'price_1month' } }] }
          }
        }
      };

      stripe.webhooks.constructEvent.mockReturnValue(event1);

      const res1 = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'sig1')
        .send(JSON.stringify(event1))
        .expect(200);

      expect(res1.body.received).toBe(true);

      // Event 2: Invoice payment succeeded
      const event2 = {
        type: 'invoice.payment_succeeded',
        id: 'evt_seq2',
        data: {
          object: {
            id: 'in_seq123',
            subscription: 'sub_seq123',
            amount_paid: 999,
            status: 'paid'
          }
        }
      };

      stripe.webhooks.constructEvent.mockReturnValue(event2);

      const res2 = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'sig2')
        .send(JSON.stringify(event2))
        .expect(200);

      expect(res2.body.received).toBe(true);
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

    it('should prevent users from accessing others subscriptions', async () => {
      // Create two users
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('TestPassword123!', salt);

      const user1 = new User({
        firstName: 'User',
        lastName: 'One',
        email: 'user1@example.com',
        password: hash,
        isEmailVerified: true,
        stripeCustomerId: 'cus_1'
      });
      await user1.save();

      const user2 = new User({
        firstName: 'User',
        lastName: 'Two',
        email: 'user2@example.com',
        password: hash,
        isEmailVerified: true
      });
      await user2.save();

      // Create subscription for user1
      const subscription = new Subscription({
        userId: user1._id,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        plan: '1-month',
        amount: 999,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      await subscription.save();

      // Try to cancel as user2
      const jwt = require('jsonwebtoken');
      const token2 = jwt.sign({ id: user2._id }, process.env.JWT_SECRET);

      const response = await request(app)
        .delete('/api/v1/subscriptions/sub_1/cancel')
        .set('Authorization', `Bearer ${token2}`)
        .send({ atPeriodEnd: true })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});
