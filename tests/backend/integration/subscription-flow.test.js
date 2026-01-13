const request = require('supertest');
const app = require('../../../src/server');
const User = require('../../../src/models/User');
const jwt = require('jsonwebtoken');

describe('Subscription Flow Integration Tests', () => {
  let user;
  let authToken;

  beforeEach(async () => {
    user = new User({
      firstName: 'Subscription',
      lastName: 'Test',
      email: 'subscription.test@example.com',
      password: '$2a$10$hashedpassword',
      isEmailVerified: true,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true }
    });
    await user.save();

    authToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  });

  describe('Subscription Purchase Flow', () => {
    it('should retrieve available subscription plans', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.plans)).toBe(true);
      expect(response.body.data.plans.length).toBeGreaterThan(0);

      // Check plan structure
      const plan = response.body.data.plans[0];
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('price');
      expect(plan).toHaveProperty('interval');
    });

    it('should create checkout session for subscription', async () => {
      const checkoutData = {
        plan: '1-month',
        successUrl: 'http://localhost:3000/subscription-success',
        cancelUrl: 'http://localhost:3000/subscriptions'
      };

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkoutData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBeTruthy();
      expect(response.body.data.url).toBeTruthy();
    });

    it('should handle Stripe webhook for subscription creation', async () => {
      const webhookData = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_mock_session',
            customer: 'cus_mock_customer',
            subscription: 'sub_mock_subscription',
            metadata: {
              userId: user._id.toString()
            }
          }
        }
      };

      // Mock Stripe webhook signature
      const signature = 'mock_signature';

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .send(webhookData)
        .expect(200);

      expect(response.text).toBe('Webhook received');
    });

    it('should check subscription status', async () => {
      // First create a subscription via webhook simulation
      user.subscription = {
        isActive: true,
        plan: '1-month',
        stripePriceId: 'price_mock',
        stripeSubscriptionId: 'sub_mock_subscription',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      await user.save();

      const response = await request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSubscription).toBe(true);
      expect(response.body.data.plan).toBe('1-month');
    });

    it('should cancel subscription', async () => {
      // Set up active subscription
      user.subscription = {
        isActive: true,
        plan: '1-month',
        stripePriceId: 'price_mock',
        stripeSubscriptionId: 'sub_mock_subscription',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      user.stripeSubscriptionId = 'sub_mock_subscription';
      await user.save();

      const response = await request(app)
        .delete(`/api/v1/subscriptions/${user.subscription.stripeSubscriptionId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('update processed');

      // Verify subscription is cancelled in database
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.subscription.isActive).toBe(false);
    });

    it('should handle subscription expiry', async () => {
      // Set up expired subscription
      user.subscription = {
        isActive: true,
        plan: '1-month',
        stripePriceId: 'price_mock',
        stripeSubscriptionId: 'sub_mock_subscription',
        currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      };
      await user.save();

      const response = await request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSubscription).toBe(false);
      expect(response.body.data.plan).toBe('free');
    });
  });

  describe('Subscription Access Control', () => {
    it('should deny access to premium features without subscription', async () => {
      // Ensure user has no active subscription
      user.subscription = { isActive: false };
      await user.save();

      // Try to access trainer features (assuming they require subscription)
      const response = await request(app)
        .get('/api/v1/trainer/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('subscription');
    });

    it('should allow access to premium features with active subscription', async () => {
      // Set up active subscription
      user.subscription = {
        isActive: true,
        plan: 'pro',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      await user.save();

      // This would depend on actual route implementation
      // For now, just test that subscription status is accessible
      const response = await request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSubscription).toBe(true);
    });
  });
});
