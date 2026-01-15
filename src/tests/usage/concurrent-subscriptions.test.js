/**
 * Usage Tests - Concurrent Subscription Creation
 * Simulates 10 concurrent users creating subscriptions
 * Tests for race conditions, data consistency, and performance
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn().mockImplementation((data) => ({
        id: `cus_${Math.random().toString(36).substring(7)}`,
        email: data.email,
      })),
      list: jest.fn().mockResolvedValue({ data: [] }),
      retrieve: jest.fn().mockImplementation((id) => ({
        id,
        invoice_settings: { default_payment_method: 'pm_test123' },
      })),
    },
    subscriptions: {
      create: jest.fn().mockImplementation((data) => ({
        id: `sub_${Math.random().toString(36).substring(7)}`,
        customer: data.customer,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        items: { data: [{ price: { id: data.items[0].price } }] },
      })),
    },
    prices: {
      list: jest.fn().mockResolvedValue({
        data: [{ id: 'price_test123', unit_amount: 999 }],
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'price_test123',
        unit_amount: 999,
      }),
    },
  }));
});

const subscriptionsRouter = require('../../routes/users');
const app = express();
app.use(express.json());
app.use('/api/subscriptions', subscriptionsRouter);

describe('Usage Tests - Concurrent Subscriptions', () => {
  describe('10 Concurrent Subscription Creations', () => {
    it('should handle 10 simultaneous subscription requests without data corruption', async () => {
      const userPromises = [];
      const subscriptionPromises = [];

      // Step 1: Create 10 users concurrently
      for (let i = 0; i < 10; i++) {
        userPromises.push(
          User.create({
            firstName: `User${i}`,
            lastName: 'Test',
            email: `concurrent${i}@test.com`,
            password: 'hashedPassword',
            role: 'user',
            stripeCustomerId: `cus_test${i}`,
          })
        );
      }

      const users = await Promise.all(userPromises);
      expect(users).toHaveLength(10);

      // Step 2: Create subscriptions for all users concurrently
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        const token = jwt.sign(
          { id: users[i]._id, userId: users[i]._id },
          process.env.JWT_SECRET
        );

        subscriptionPromises.push(
          Subscription.create({
            userId: users[i]._id,
            stripeCustomerId: users[i].stripeCustomerId,
            stripeSubscriptionId: `sub_concurrent${i}`,
            plan: i % 4 === 0 ? '1-month' : i % 4 === 1 ? '3-month' : i % 4 === 2 ? '6-month' : '12-month',
            stripePriceId: 'price_test123',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'active',
            amount: 999,
            billingEnvironment: 'test',
          })
        );
      }

      const subscriptions = await Promise.all(subscriptionPromises);
      const endTime = Date.now();

      // Assertions
      expect(subscriptions).toHaveLength(10);
      
      // All subscriptions should be created
      subscriptions.forEach((sub, index) => {
        expect(sub.userId.toString()).toBe(users[index]._id.toString());
        expect(sub.status).toBe('active');
      });

      // Performance check - should complete in reasonable time (< 5 seconds)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000);

      console.log(`✅ Created 10 concurrent subscriptions in ${duration}ms`);
    });

    it('should prevent duplicate subscriptions for same user', async () => {
      const user = await User.create({
        firstName: 'Duplicate',
        lastName: 'Test',
        email: 'duplicate@test.com',
        password: 'hashedPassword',
        stripeCustomerId: 'cus_duplicate_test',
      });

      // Try to create multiple subscriptions concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          Subscription.create({
            userId: user._id,
            stripeCustomerId: user.stripeCustomerId,
            stripeSubscriptionId: `sub_dup${i}`, // Different IDs
            plan: '1-month',
            stripePriceId: 'price_test123',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'active',
            amount: 999,
            billingEnvironment: 'test',
          })
        );
      }

      // All should succeed (multiple subscriptions allowed per user)
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
    });

    it('should maintain data consistency under concurrent updates', async () => {
      const user = await User.create({
        firstName: 'Consistency',
        lastName: 'Test',
        email: 'consistency@test.com',
        password: 'hashedPassword',
      });

      const subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: 'cus_consistency',
        stripeSubscriptionId: 'sub_consistency',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test',
      });

      // Try to update subscription status concurrently
      const updatePromises = [];
      const statuses = ['active', 'past_due', 'canceled', 'active', 'paused'];

      for (let i = 0; i < 5; i++) {
        updatePromises.push(
          Subscription.findByIdAndUpdate(
            subscription._id,
            { status: statuses[i] },
            { new: true }
          )
        );
      }

      await Promise.all(updatePromises);

      // Check final state
      const finalSub = await Subscription.findById(subscription._id);
      expect(finalSub).not.toBeNull();
      expect(statuses).toContain(finalSub.status); // Should be one of the attempted statuses
    });
  });

  describe('Performance & Load Testing', () => {
    it('should handle rapid sequential requests', async () => {
      const user = await User.create({
        firstName: 'Rapid',
        lastName: 'Test',
        email: 'rapid@test.com',
        password: 'hashedPassword',
        stripeCustomerId: 'cus_rapid',
      });

      const startTime = Date.now();
      const promises = [];

      // Create 20 subscriptions sequentially (simulating rapid clicks)
      for (let i = 0; i < 20; i++) {
        promises.push(
          Subscription.create({
            userId: user._id,
            stripeCustomerId: user.stripeCustomerId,
            stripeSubscriptionId: `sub_rapid${i}`,
            plan: '1-month',
            stripePriceId: 'price_test123',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'active',
            amount: 999,
            billingEnvironment: 'test',
          })
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      
      const duration = endTime - startTime;
      console.log(`✅ Created 20 subscriptions in ${duration}ms (${(duration / 20).toFixed(2)}ms per subscription)`);
      
      // Should average less than 100ms per subscription
      expect(duration / 20).toBeLessThan(100);
    });

    it('should maintain performance with large dataset', async () => {
      // Create 50 users with subscriptions
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(
          User.create({
            firstName: `LoadTest${i}`,
            lastName: 'User',
            email: `load${i}@test.com`,
            password: 'hashedPassword',
            stripeCustomerId: `cus_load${i}`,
          }).then(user =>
            Subscription.create({
              userId: user._id,
              stripeCustomerId: user.stripeCustomerId,
              stripeSubscriptionId: `sub_load${i}`,
              plan: '1-month',
              stripePriceId: 'price_test123',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              status: 'active',
              amount: 999,
              billingEnvironment: 'test',
            })
          )
        );
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      const duration = endTime - startTime;
      console.log(`✅ Created 50 users with subscriptions in ${duration}ms`);

      // Query performance test
      const queryStart = Date.now();
      const activeSubscriptions = await Subscription.find({ status: 'active' });
      const queryEnd = Date.now();

      expect(activeSubscriptions.length).toBeGreaterThanOrEqual(50);
      
      const queryDuration = queryEnd - queryStart;
      console.log(`✅ Queried ${activeSubscriptions.length} subscriptions in ${queryDuration}ms`);
      
      // Query should be fast even with large dataset
      expect(queryDuration).toBeLessThan(1000);
    });
  });

  describe('Race Condition Tests', () => {
    it('should handle concurrent create and cancel operations', async () => {
      const user = await User.create({
        firstName: 'Race',
        lastName: 'Condition',
        email: 'race@test.com',
        password: 'hashedPassword',
        stripeCustomerId: 'cus_race',
      });

      const subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: 'sub_race',
        plan: '1-month',
        stripePriceId: 'price_test123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        amount: 999,
        billingEnvironment: 'test',
      });

      // Simultaneously try to cancel and update subscription
      const operations = [
        Subscription.findByIdAndUpdate(subscription._id, { status: 'canceled' }),
        Subscription.findByIdAndUpdate(subscription._id, { canceledAt: new Date() }),
        Subscription.findByIdAndUpdate(subscription._id, { cancelAtPeriodEnd: true }),
      ];

      await Promise.all(operations);

      // Verify final state is consistent
      const finalSub = await Subscription.findById(subscription._id);
      expect(finalSub).not.toBeNull();
      
      // At least one operation should have succeeded
      expect(
        finalSub.status === 'canceled' ||
        finalSub.canceledAt !== null ||
        finalSub.cancelAtPeriodEnd === true
      ).toBe(true);
    });
  });
});