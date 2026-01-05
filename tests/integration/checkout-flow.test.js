const request = require('supertest');
const express = require('express');
const User = require('../../src/models/User');
const Program = require('../../src/models/Program');
const Cart = require('../../src/models/Cart');
const Order = require('../../src/models/Order');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock mailjet
jest.mock('node-mailjet', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      post: jest.fn().mockReturnValue({
        request: jest.fn().mockResolvedValue({ body: { Messages: [{ Status: 'success' }] } })
      })
    }))
  };
});

// Setup minimal app with routes
const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }
  }
  next();
});

app.use('/api/auth', require('../../src/routes/auth'));
app.use('/api/programs', require('../../src/routes/programs'));
app.use('/api/cart', require('../../src/routes/cart'));
app.use('/api/orders', require('../../src/routes/orders'));

describe('Complete Checkout Flow Integration', () => {
  let program1, program2;

  beforeEach(async () => {
    // Create test programs
    program1 = await Program.create({
      title: 'Beginner Program',
      description: 'Perfect for beginners',
      preview: 'Start your fitness journey',
      price: 49.99,
      duration: '4 weeks',
      level: 'Beginner',
      frequency: '3 days per week',
      sessionLength: '45 minutes',
      slug: 'beginner-program',
      isPublished: true,
      isActive: true
    });

    program2 = await Program.create({
      title: 'Advanced Program',
      description: 'For experienced athletes',
      preview: 'Take your fitness to the next level',
      price: 79.99,
      duration: '8 weeks',
      level: 'Advanced',
      frequency: '5 days per week',
      sessionLength: '60 minutes',
      slug: 'advanced-program',
      isPublished: true,
      isActive: true
    });
  });

  test('Complete user journey: signup -> browse -> add to cart -> checkout', async () => {
    // Step 1: User signs up
    const signupResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'testuser@example.com',
        password: 'Test123!@#'
      })
      .expect(201);

    expect(signupResponse.body.email).toBe('testuser@example.com');

    // Step 2: Verify email
    const user = await User.findOne({ email: 'testuser@example.com' });
    const verifyResponse = await request(app)
      .post('/api/auth/verify-email')
      .send({
        email: 'testuser@example.com',
        otp: user.emailVerificationToken
      })
      .expect(200);

    const token = verifyResponse.body.token;
    expect(token).toBeDefined();

    // Step 3: Browse marketplace
    const marketplaceResponse = await request(app)
      .get('/api/programs/marketplace')
      .expect(200);

    expect(marketplaceResponse.body).toHaveLength(2);

    // Step 4: View program details
    const programDetailsResponse = await request(app)
      .get(`/api/programs/marketplace/${program1._id}`)
      .expect(200);

    expect(programDetailsResponse.body.title).toBe('Beginner Program');

    // Step 5: Add first program to cart
    await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        programId: program1._id.toString(),
        quantity: 1
      })
      .expect(200);

    // Step 6: Add second program to cart
    const cartResponse = await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        programId: program2._id.toString(),
        quantity: 1
      })
      .expect(200);

    expect(cartResponse.body.items).toHaveLength(2);

    // Step 7: Update quantity of first item
    const firstItemId = cartResponse.body.items[0]._id;
    await request(app)
      .put(`/api/cart/update/${firstItemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2 })
      .expect(200);

    // Step 8: Get updated cart
    const updatedCartResponse = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(updatedCartResponse.body.items[0].quantity).toBe(2);

    // Step 9: Create order
    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'Test User',
          email: 'testuser@example.com',
          phone: '1234567890',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'USA'
        }
      })
      .expect(200);

    expect(orderResponse.body.orderNumber).toBeDefined();
    expect(orderResponse.body.items).toHaveLength(2);
    expect(orderResponse.body.status).toBe('pending');

    // Step 10: Verify cart is cleared
    const clearedCartResponse = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(clearedCartResponse.body.items).toHaveLength(0);

    // Step 11: View order history
    const ordersResponse = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(ordersResponse.body).toHaveLength(1);
    expect(ordersResponse.body[0].orderNumber).toBe(orderResponse.body.orderNumber);

    // Step 12: View specific order
    const orderDetailResponse = await request(app)
      .get(`/api/orders/${orderResponse.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(orderDetailResponse.body.total).toBeDefined();
    expect(orderDetailResponse.body.billingInfo.fullName).toBe('Test User');
  });

  test('User cannot access another users order', async () => {
    // Create two users
    const user1 = await User.create({
      firstName: 'User',
      lastName: 'One',
      email: 'user1@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
      isEmailVerified: true
    });

    const user2 = await User.create({
      firstName: 'User',
      lastName: 'Two',
      email: 'user2@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
      isEmailVerified: true
    });

    const token1 = jwt.sign({ id: user1._id, role: user1.role }, process.env.JWT_SECRET);
    const token2 = jwt.sign({ id: user2._id, role: user2.role }, process.env.JWT_SECRET);

    // User 1 creates an order
    await Cart.create({
      userId: user1._id,
      items: [
        {
          program: program1._id,
          quantity: 1,
          price: program1.price
        }
      ]
    });

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'User One',
          email: 'user1@example.com'
        }
      })
      .expect(200);

    // User 2 tries to access User 1's order
    await request(app)
      .get(`/api/orders/${orderResponse.body._id}`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(403);
  });

  test('Error handling: checkout with empty cart', async () => {
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
      isEmailVerified: true
    });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);

    // Create empty cart
    await Cart.create({
      userId: user._id,
      items: []
    });

    // Try to create order with empty cart
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'Test User',
          email: 'testuser@example.com'
        }
      })
      .expect(400);

    expect(response.body.msg).toContain('Cart is empty');
  });

  test('Cart persists across sessions', async () => {
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser@example.com',
      password: await bcrypt.hash('Test123!@#', 10),
      isEmailVerified: true
    });

    const token1 = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Add item to cart
    await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        programId: program1._id.toString(),
        quantity: 2
      })
      .expect(200);

    // Simulate new session with new token
    const token2 = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Cart should still have items
    const cartResponse = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(cartResponse.body.items).toHaveLength(1);
    expect(cartResponse.body.items[0].quantity).toBe(2);
  });
});