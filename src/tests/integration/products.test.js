/**
 * Integration Tests for Product Sales & E-commerce
 * Tests product listing, checkout, order creation, and purchase validation
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/User');
const Purchase = require('../../models/Purchase');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_product_test123',
        email: 'test@example.com'
      })
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_product_test123',
          url: 'https://checkout.stripe.com/product-test'
        })
      }
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'price_product123',
        unit_amount: 1599,
        currency: 'jmd'
      })
    }
  }));
});

describe('Product Sales & E-commerce', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'product@example.com',
      password: hashedPassword,
      isEmailVerified: true,
      stripeCustomerId: 'cus_product_test123',
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    authToken = jwt.sign(
      { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );
  });

  describe('GET /api/v1/products', () => {
    test('should retrieve product listings', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.products).toBeDefined();
      expect(typeof response.body.products).toBe('object');
    });

    test('should return products even if Stripe fails', async () => {
      // Mock Stripe to fail
      const stripe = require('stripe');
      const stripeInstance = stripe();
      stripeInstance.prices.retrieve.mockRejectedValueOnce(new Error('Stripe error'));

      const response = await request(app)
        .get('/api/v1/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.products).toBeDefined();
    });

    test('should not require authentication for product listing', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .expect(200);

      expect(response.body.products).toBeDefined();
    });
  });

  describe('POST /api/v1/products/checkout', () => {
    test('should create checkout session for valid products', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'seamoss-small', quantity: 2 }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.checkoutUrl).toContain('stripe.com');

      // Verify purchase record was created
      const purchase = await Purchase.findOne({ userId: testUser._id });
      expect(purchase).toBeTruthy();
      expect(purchase.status).toBe('pending');
      expect(purchase.items).toHaveLength(1);
    });

    test('should reject empty cart', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Items array is required');
    });

    test('should reject invalid product keys', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'invalid-product', quantity: 1 }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid product');
    });

    test('should reject invalid quantities', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'seamoss-small', quantity: 0 }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid quantity');
    });

    test('should reject excessive quantities (>100)', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'seamoss-small', quantity: 101 }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid quantity');
    });

    test('should reject too many items in cart (>50)', async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        productKey: 'seamoss-small',
        quantity: 1
      }));

      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ items })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Too many items');
    });

    test('should handle multiple products in cart', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'seamoss-small', quantity: 2 },
            { productKey: 'coconut-water', quantity: 1 }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const purchase = await Purchase.findOne({ userId: testUser._id });
      expect(purchase.items).toHaveLength(2);
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/v1/products/checkout')
        .send({
          items: [{ productKey: 'seamoss-small', quantity: 1 }]
        })
        .expect(401);
    });

    test('should calculate total amount server-side', async () => {
      const response = await request(app)
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productKey: 'seamoss-small', quantity: 2 }
          ]
        })
        .expect(200);

      const purchase = await Purchase.findOne({ userId: testUser._id });
      expect(purchase.totalAmount).toBeGreaterThan(0);
      // Verify total is calculated server-side, not from client
      expect(purchase.totalAmount).toBe(purchase.items[0].totalPrice);
    });

    test('should create Stripe customer if missing', async () => {
      // Create user without Stripe customer
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const newUser = await User.create({
        firstName: 'New',
        lastName: 'User',
        email: 'newproduct@example.com',
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
        .post('/api/v1/products/checkout')
        .set('Authorization', `Bearer ${newToken}`)
        .send({
          items: [{ productKey: 'seamoss-small', quantity: 1 }]
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Stripe customer was created
      const updatedUser = await User.findById(newUser._id);
      expect(updatedUser.stripeCustomerId).toBeDefined();
    });
  });

  describe('GET /api/v1/products/purchases', () => {
    test('should get user purchase history', async () => {
      // Create completed purchases
      await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_product_test123',
        stripeCheckoutSessionId: 'cs_test1',
        stripePaymentIntentId: 'pi_test1',
        items: [
          {
            productKey: 'seamoss-small',
            name: 'Seamoss - Small Size',
            quantity: 2,
            unitPrice: 1599,
            totalPrice: 3198
          }
        ],
        totalAmount: 3198,
        currency: 'jmd',
        status: 'completed',
        billingEnvironment: 'test'
      });

      const response = await request(app)
        .get('/api/v1/products/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.purchases).toHaveLength(1);
      expect(response.body.purchases[0].status).toBe('completed');
    });

    test('should only return completed purchases', async () => {
      // Create both pending and completed purchases
      await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_product_test123',
        status: 'pending',
        items: [{ productKey: 'seamoss-small', quantity: 1 }],
        totalAmount: 1599
      });

      await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_product_test123',
        status: 'completed',
        items: [{ productKey: 'coconut-water', quantity: 1 }],
        totalAmount: 1599
      });

      const response = await request(app)
        .get('/api/v1/products/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.purchases).toHaveLength(1);
      expect(response.body.purchases[0].status).toBe('completed');
    });

    test('should prevent IDOR - only return own purchases', async () => {
      // Create another user with purchases
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      await Purchase.create({
        userId: otherUser._id,
        stripeCustomerId: 'cus_other123',
        status: 'completed',
        items: [{ productKey: 'seamoss-small', quantity: 1 }],
        totalAmount: 1599
      });

      const response = await request(app)
        .get('/api/v1/products/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should not see other user's purchases
      expect(response.body.purchases).toHaveLength(0);
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/v1/products/purchases')
        .expect(401);
    });

    test('should return empty array for users with no purchases', async () => {
      const response = await request(app)
        .get('/api/v1/products/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.purchases).toHaveLength(0);
    });
  });

  describe('Webhook - Purchase Completion', () => {
    test('should mark purchase as completed on successful payment', async () => {
      // Create pending purchase
      const purchase = await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_product_test123',
        stripeCheckoutSessionId: 'cs_purchase_test123',
        status: 'pending',
        items: [
          {
            productKey: 'seamoss-small',
            name: 'Seamoss - Small Size',
            quantity: 1,
            unitPrice: 1599,
            totalPrice: 1599
          }
        ],
        totalAmount: 1599,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_purchase_test123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_purchase_test123',
            customer: 'cus_product_test123',
            mode: 'payment',
            payment_intent: 'pi_test123',
            payment_status: 'paid'
          }
        }
      };

      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      // Verify purchase was marked as completed
      const updatedPurchase = await Purchase.findById(purchase._id);
      expect(updatedPurchase.status).toBe('completed');
      expect(updatedPurchase.stripePaymentIntentId).toBe('pi_test123');
    });

    test('should mark purchase as failed on payment failure', async () => {
      const purchase = await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_product_test123',
        stripeCheckoutSessionId: 'cs_failed_test123',
        status: 'pending',
        items: [{ productKey: 'seamoss-small', quantity: 1 }],
        totalAmount: 1599,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_failed_test123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_failed_test123',
            customer: 'cus_product_test123',
            mode: 'payment',
            payment_status: 'unpaid'
          }
        }
      };

      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      const updatedPurchase = await Purchase.findById(purchase._id);
      expect(updatedPurchase.status).toBe('failed');
    });
  });
});
