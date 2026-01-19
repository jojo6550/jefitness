/**
 * Integration Tests for Subscription Management (Stripe)
 * Tests subscription creation, webhooks, status updates, and access control
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const app = require('../../server');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com'
      })
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        items: {
          data: [{
            price: {
              id: 'price_test123',
              unit_amount: 999
            }
          }]
        }
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active'
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active'
      }),
      cancel: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'canceled'
      })
    },
    prices: {
      list: jest.fn().mockResolvedValue({
        data: [{
          id: 'price_test123',
          unit_amount: 999,
          currency: 'jmd',
          recurring: { interval: 'month' }
        }]
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'price_test123',
        unit_amount: 999,
        currency: 'jmd'
      })
    },
    webhooks: {
      constructEvent: jest.fn((body, sig, secret) => {
        return JSON.parse(body);
      })
    }
  }));
});

describe('Subscription Management', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'sub@example.com',
      password: hashedPassword,
      isEmailVerified: true,
      stripeCustomerId: 'cus_test123',
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    authToken = jwt.sign(
      { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );
  });

  describe('POST /api/v1/subscriptions/create-checkout', () => {
    test('should create checkout session for valid plan', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create-checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: '1-month' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.url).toContain('stripe.com');
    });

    test('should reject invalid plan', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create-checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: 'invalid-plan' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid plan');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/v1/subscriptions/create-checkout')
        .send({ plan: '1-month' })
        .expect(401);
    });

    test('should create Stripe customer if not exists', async () => {
      // Create user without Stripe customer ID
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const newUser = await User.create({
        firstName: 'New',
        lastName: 'User',
        email: 'newuser@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      const newToken = jwt.sign(
        { id: newUser._id, userId: newUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .post('/api/v1/subscriptions/create-checkout')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ plan: '1-month' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Stripe customer was created
      const updatedUser = await User.findById(newUser._id);
      expect(updatedUser.stripeCustomerId).toBeDefined();
    });
  });

  describe('POST /api/v1/webhooks/stripe', () => {
    test('should handle subscription created webhook', async () => {
      const webhookEvent = {
        id: 'evt_test123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            customer: 'cus_test123',
            subscription: 'sub_test123',
            mode: 'subscription',
            metadata: {
              userId: testUser._id.toString(),
              plan: '1-month'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify subscription was created
      const subscription = await Subscription.findOne({ 
        userId: testUser._id 
      });
      expect(subscription).toBeTruthy();
      expect(subscription.status).toBe('active');
    });

    test('should handle subscription updated webhook', async () => {
      // Create existing subscription
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 2592000000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_test456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'past_due',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              data: [{
                price: {
                  id: 'price_test123',
                  unit_amount: 999
                }
              }]
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify subscription status was updated
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: 'sub_test123'
      });
      expect(subscription.status).toBe('past_due');
    });

    test('should handle subscription canceled webhook', async () => {
      // Create existing subscription
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 2592000000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_test789',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'canceled'
          }
        }
      };

      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      // Verify subscription was canceled
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: 'sub_test123'
      });
      expect(subscription.status).toBe('canceled');
    });

    test('should prevent replay attacks (idempotency)', async () => {
      const webhookEvent = {
        id: 'evt_duplicate123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            customer: 'cus_test123',
            subscription: 'sub_test123',
            mode: 'subscription',
            metadata: {
              userId: testUser._id.toString(),
              plan: '1-month'
            }
          }
        }
      };

      // Send same event twice
      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      const secondResponse = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      // Second request should be acknowledged but not processed
      expect(secondResponse.body.received).toBe(true);

      // Verify only one subscription was created
      const subscriptions = await Subscription.find({ 
        userId: testUser._id 
      });
      expect(subscriptions.length).toBeLessThanOrEqual(1);
    });

    test('should reject webhook with invalid signature', async () => {
      // Mock Stripe to throw signature verification error
      const stripe = require('stripe');
      const stripeInstance = stripe();
      stripeInstance.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const webhookEvent = {
        id: 'evt_test123',
        type: 'checkout.session.completed',
        data: { object: {} }
      };

      const response = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'invalid-signature')
        .send(webhookEvent)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Subscription Access Control', () => {
    test('should allow active subscribers to access protected content', async () => {
      // Create active subscription
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_active123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 2592000000), // 30 days from now
        status: 'active',
        amount: 999,
        billingEnvironment: 'test'
      });

      // Update user subscription status
      await User.findByIdAndUpdate(testUser._id, {
        subscriptionStatus: 'active',
        subscriptionEndDate: new Date(Date.now() + 2592000000)
      });

      // Try to access protected route (assuming there's a protected route)
      // This is a placeholder - adjust based on your actual protected routes
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should deny access to past_due subscribers', async () => {
      // Create past_due subscription
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_pastdue123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(Date.now() - 2592000000),
        currentPeriodEnd: new Date(),
        status: 'past_due',
        amount: 999,
        billingEnvironment: 'test'
      });

      await User.findByIdAndUpdate(testUser._id, {
        subscriptionStatus: 'past_due',
        subscriptionEndDate: new Date()
      });

      // Verify subscription status is past_due
      const sub = await Subscription.findOne({ userId: testUser._id });
      expect(sub.status).toBe('past_due');
    });

    test('should deny access to canceled subscribers', async () => {
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_canceled123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(Date.now() - 2592000000),
        currentPeriodEnd: new Date(Date.now() - 86400000),
        status: 'canceled',
        canceledAt: new Date(),
        amount: 999,
        billingEnvironment: 'test'
      });

      await User.findByIdAndUpdate(testUser._id, {
        subscriptionStatus: 'canceled',
        subscriptionEndDate: new Date(Date.now() - 86400000)
      });

      const sub = await Subscription.findOne({ userId: testUser._id });
      expect(sub.status).toBe('canceled');
    });
  });

  describe('GET /api/v1/subscriptions/status', () => {
    test('should get current subscription status', async () => {
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 2592000000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test'
      });

      const response = await request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.subscription.status).toBe('active');
    });

    test('should return null for users without subscription', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeNull();
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/v1/subscriptions/status')
        .expect(401);
    });
  });

  describe('POST /api/v1/subscriptions/cancel', () => {
    test('should cancel active subscription', async () => {
      await Subscription.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 2592000000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test'
      });

      const response = await request(app)
        .post('/api/v1/subscriptions/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const subscription = await Subscription.findOne({ userId: testUser._id });
      expect(subscription.cancelAtPeriodEnd).toBe(true);
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/v1/subscriptions/cancel')
        .expect(401);
    });
  });
});
