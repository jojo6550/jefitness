/**
 * Cart API Route Tests
 * Tests all cart endpoints with mocked database and authentication
 */

const request = require('supertest');
const app = require('../../src/server');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');

// Test data
let userToken;
let userId;

describe('Cart API', () => {
  beforeEach(async () => {
    // Create test user and generate token
    const user = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'carttest@example.com',
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
            price: 15.99,
            quantity: 2
          }
        ]
      }
    });
    await user.save();
    userId = user._id;
    
    // Generate JWT token
    userToken = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET);
  });

  afterEach(async () => {
    // Clean up test user
    await User.deleteOne({ _id: userId });
  });

  // ============================================
  // GET /api/v1/cart - Get Cart
  // ============================================
  describe('GET /api/v1/cart', () => {
    test('should return cart successfully', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart).toBeDefined();
      expect(response.body.data.cart.items).toHaveLength(1);
      expect(response.body.data.cart.items[0].productId).toBe('seamoss-small');
      expect(response.body.data.cart.items[0].quantity).toBe(2);
    });

    test('should return empty cart for new user', async () => {
      // Create user without cart
      const newUser = new User({
        firstName: 'New',
        lastName: 'User',
        email: 'newcarttest@example.com',
        password: 'password123',
        role: 'user',
        isEmailVerified: true,
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      });
      await newUser.save();
      
      const newUserToken = jwt.sign({ id: newUser._id, role: 'user' }, process.env.JWT_SECRET);
      
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items).toHaveLength(0);
      
      // Clean up
      await User.deleteOne({ _id: newUser._id });
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // POST /api/v1/cart/products - Add to Cart
  // ============================================
  describe('POST /api/v1/cart/products', () => {
    test('should add product to cart successfully', async () => {
      const response = await request(app)
        .post('/api/v1/cart/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          productId: 'coconut-water',
          name: 'Coconut Water',
          price: 899,
          quantity: 3
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart).toBeDefined();
      expect(response.body.data.cart.items).toHaveLength(2);
      
      // Check the new product was added
      const newItem = response.body.data.cart.items.find(
        item => item.productId === 'coconut-water'
      );
      expect(newItem).toBeDefined();
      expect(newItem.quantity).toBe(3);
    });

    test('should increase quantity if product already in cart', async () => {
      // Add same product that already exists in cart (seamoss-small)
      const response = await request(app)
        .post('/api/v1/cart/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          productId: 'seamoss-small',
          name: 'Seamoss - Small Size',
          price: 1599,
          quantity: 1
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items).toHaveLength(1);
      expect(response.body.data.cart.items[0].quantity).toBe(3); // 2 + 1
    });

    test('should return 400 for missing productId', async () => {
      const response = await request(app)
        .post('/api/v1/cart/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Test Product',
          price: 999,
          quantity: 1
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
    });

    test('should return 400 for invalid price', async () => {
      const response = await request(app)
        .post('/api/v1/cart/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          productId: 'test-product',
          name: 'Test Product',
          price: -100,
          quantity: 1
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 400 for invalid quantity', async () => {
      const response = await request(app)
        .post('/api/v1/cart/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          productId: 'test-product',
          name: 'Test Product',
          price: 999,
          quantity: 0
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .post('/api/v1/cart/products')
        .send({
          productId: 'test-product',
          name: 'Test Product',
          price: 999,
          quantity: 1
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // PUT /api/v1/cart/products/:id - Update Quantity
  // ============================================
  describe('PUT /api/v1/cart/products/:productId', () => {
    test('should update product quantity successfully', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/seamoss-small')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items[0].quantity).toBe(5);
    });

    test('should set quantity to 1 for valid update', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/seamoss-small')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items[0].quantity).toBe(1);
    });

    test('should return 400 for quantity less than 1', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/seamoss-small')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 400 for invalid productId format', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/invalid!@#')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 5 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/non-existent-product')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 5 })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Product not found in cart');
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .put('/api/v1/cart/products/seamoss-small')
        .send({ quantity: 5 })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // DELETE /api/v1/cart/products/:id - Remove from Cart
  // ============================================
  describe('DELETE /api/v1/cart/products/:productId', () => {
    test('should remove product from cart successfully', async () => {
      const response = await request(app)
        .delete('/api/v1/cart/products/seamoss-small')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items).toHaveLength(0);
    });

    test('should return empty cart after removal', async () => {
      const response = await request(app)
        .delete('/api/v1/cart/products/seamoss-small')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data.cart.items).toEqual([]);
    });

    test('should return 400 for invalid productId format', async () => {
      const response = await request(app)
        .delete('/api/v1/cart/products/invalid!@#')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .delete('/api/v1/cart/products/non-existent-product')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Product not found in cart');
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .delete('/api/v1/cart/products/seamoss-small')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // DELETE /api/v1/cart - Clear Cart
  // ============================================
  describe('DELETE /api/v1/cart', () => {
    test('should clear entire cart successfully', async () => {
      const response = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items).toHaveLength(0);
      expect(response.body.data.message).toBe('Cart cleared successfully');
    });

    test('should return 401 without token', async () => {
      const response = await request(app)
        .delete('/api/v1/cart')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

