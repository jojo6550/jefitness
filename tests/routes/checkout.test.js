/**
 * Checkout API Route Tests
 * Tests all checkout endpoints with mocked Stripe service
 */

const request = require('supertest');
const app = require('../../src/server');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');

// Mock Stripe service
jest.mock('../../src/services/stripe');

const {
  createProductCheckoutSession,
  getCheckoutSession,
  getOrCreateProductCustomer
} = require('../../src/services/stripe');

// Test data
let userToken;
let userId;
let user;

describe('Checkout API', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create test user with cart items
    user = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'checkouttest@example.com',
      password: 'password123',
      role: 'user',
      isEmailVerified: true,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true },
      productCart: {
        items: [
          {
            productId: 'seamoss-small',
            name: 'Seamoss - Small Size',
            price: 1599,
            quantity: 2
          },
          {
            productId: 'coconut-water',
            name: 'Coconut Water',
            price: 899,
            quantity: 1
          }
        ]
      }
    });
    await user.save();
    userId = user._id;
    
    // Generate JWT token
    userToken = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET);
    
    // Setup default mocks
    getOrCreateProductCustomer.mockResolvedValue({
      id: 'cus_test123',
      email: 'checkouttest@example.com'
    });
    
    createProductCheckoutSession.mockResolvedValue({
      id: 'cs_test123',
      url: 'https://checkout.stripe.com/test',
      payment_status: 'unpaid',
      amount_total: 4097
    });
  });

  afterEach(async () => {
    // Clean up test user
    await User.deleteOne({ _id: userId });
  });

  // ============================================
  // POST /api/v1/checkout/create-session - Create Checkout Session
  // ============================================
  describe('POST /api/v1/checkout/create-session', () => {
    test('should create checkout session successfully', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe('cs_test123');
      expect(response.body.data.url).toBe('https://checkout.stripe.com/test');
      expect(createProductCheckoutSession).toHaveBeenCalledWith(
        'cus_test123',
        expect.arrayContaining([
          expect.objectContaining({ productId: 'seamoss-small' }),
          expect.objectContaining({ productId: 'coconut-water' })
        ]),
        'https://example.com/success',
        'https://example.com/cancel'
      );
    });

    test('should use default URLs if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(createProductCheckoutSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.stringContaining('/checkout-success'),
        expect.stringContaining('/products.html')
      );
    });

    test('should return 400 for empty cart', async () => {
      // Clear user cart
      await User.findByIdAndUpdate(userId, { $set: { 'productCart.items': [] } });
      
      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Cart is empty');
    });

    test('should return 500 for Stripe customer error', async () => {
      getOrCreateProductCustomer.mockRejectedValue(new Error('Stripe customer error'));

      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to create checkout session');
    });

    test('should return 500 for Stripe session creation error', async () => {
      createProductCheckoutSession.mockRejectedValue(new Error('Stripe session error'));

      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to create checkout session');
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/create-session')
        .send({
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // GET /api/v1/checkout/session/:sessionId - Get Session
  // ============================================
  describe('GET /api/v1/checkout/session/:sessionId', () => {
    test('should retrieve checkout session successfully', async () => {
      getCheckoutSession.mockResolvedValue({
        id: 'cs_test123',
        payment_status: 'paid',
        amount_total: 4097,
        customer_email: 'checkouttest@example.com'
      });

      const response = await request(app)
        .get('/api/v1/checkout/session/cs_test123')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeDefined();
      expect(response.body.data.session.id).toBe('cs_test123');
    });

    test('should return session with payment details', async () => {
      getCheckoutSession.mockResolvedValue({
        id: 'cs_test123',
        payment_status: 'paid',
        amount_total: 4097,
        customer_email: 'checkouttest@example.com',
        metadata: {
          orderId: 'order_123'
        }
      });

      const response = await request(app)
        .get('/api/v1/checkout/session/cs_test123')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data.session.payment_status).toBe('paid');
    });

    test('should return 500 for Stripe error', async () => {
      getCheckoutSession.mockRejectedValue(new Error('Stripe error'));

      const response = await request(app)
        .get('/api/v1/checkout/session/cs_test123')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/v1/checkout/session/cs_test123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // POST /api/v1/checkout/complete - Complete Checkout
  // ============================================
  describe('POST /api/v1/checkout/complete', () => {
    test('should complete checkout and clear cart', async () => {
      getCheckoutSession.mockResolvedValue({
        id: 'cs_test123',
        payment_status: 'paid',
        amount_total: 4097
      });

      const response = await request(app)
        .post('/api/v1/checkout/complete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          sessionId: 'cs_test123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toBeDefined();
      expect(response.body.data.order.paymentStatus).toBe('paid');
      expect(response.body.data.cart.items).toHaveLength(0);
    });

    test('should return 400 for unpaid session', async () => {
      getCheckoutSession.mockResolvedValue({
        id: 'cs_test123',
        payment_status: 'unpaid',
        amount_total: 4097
      });

      const response = await request(app)
        .post('/api/v1/checkout/complete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          sessionId: 'cs_test123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Payment not completed');
    });

    test('should return 400 for missing sessionId', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/complete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 500 for Stripe error', async () => {
      getCheckoutSession.mockRejectedValue(new Error('Stripe error'));

      const response = await request(app)
        .post('/api/v1/checkout/complete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          sessionId: 'cs_test123'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/complete')
        .send({
          sessionId: 'cs_test123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // POST /api/v1/checkout/clear-cart - Clear Cart
  // ============================================
  describe('POST /api/v1/checkout/clear-cart', () => {
    test('should clear cart successfully', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/clear-cart')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Cart cleared');
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .post('/api/v1/checkout/clear-cart')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

