const request = require('supertest');
const express = require('express');
const cartRouter = require('../../src/routes/cart');
const User = require('../../src/models/User');
const Program = require('../../src/models/Program');
const Cart = require('../../src/models/Cart');
const jwt = require('jsonwebtoken');

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

app.use('/api/cart', cartRouter);

describe('Cart Routes', () => {
  let user;
  let program;
  let token;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'Test123!@#',
      isEmailVerified: true
    });

    program = await Program.create({
      title: 'Test Program',
      description: 'Test description',
      preview: 'Test preview',
      price: 49.99,
      duration: '4 weeks',
      level: 'Beginner',
      frequency: '3 days per week',
      sessionLength: '45 minutes',
      slug: 'test-program'
    });

    token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  });

  describe('GET /api/cart', () => {
    test('should get empty cart for new user', async () => {
      const response = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.userId.toString()).toBe(user._id.toString());
    });

    test('should get cart with items', async () => {
      await Cart.create({
        userId: user._id,
        items: [
          {
            program: program._id,
            quantity: 2,
            price: program.price
          }
        ]
      });

      const response = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(2);
    });

    test('should reject request without auth token', async () => {
      await request(app).get('/api/cart').expect(401);
    });
  });

  describe('POST /api/cart/add', () => {
    test('should add new item to cart', async () => {
      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          programId: program._id.toString(),
          quantity: 1
        })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(1);
      expect(response.body.items[0].price).toBe(49.99);
    });

    test('should update quantity if item already exists', async () => {
      await Cart.create({
        userId: user._id,
        items: [
          {
            program: program._id,
            quantity: 1,
            price: program.price
          }
        ]
      });

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          programId: program._id.toString(),
          quantity: 2
        })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(3);
    });

    test('should reject adding non-existent program', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          programId: fakeId,
          quantity: 1
        })
        .expect(404);

      expect(response.body.msg).toBe('Program not found');
    });

    test('should default quantity to 1', async () => {
      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          programId: program._id.toString()
        })
        .expect(200);

      expect(response.body.items[0].quantity).toBe(1);
    });
  });

  describe('PUT /api/cart/update/:itemId', () => {
    let cart;
    let itemId;

    beforeEach(async () => {
      cart = await Cart.create({
        userId: user._id,
        items: [
          {
            program: program._id,
            quantity: 2,
            price: program.price
          }
        ]
      });
      itemId = cart.items[0]._id.toString();
    });

    test('should update item quantity', async () => {
      const response = await request(app)
        .put(`/api/cart/update/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 })
        .expect(200);

      expect(response.body.items[0].quantity).toBe(5);
    });

    test('should reject quantity less than 1', async () => {
      const response = await request(app)
        .put(`/api/cart/update/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 0 })
        .expect(400);

      expect(response.body.msg).toContain('at least 1');
    });

    test('should reject updating non-existent item', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      await request(app)
        .put(`/api/cart/update/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 3 })
        .expect(404);
    });
  });

  describe('DELETE /api/cart/remove/:itemId', () => {
    let cart;
    let itemId;

    beforeEach(async () => {
      cart = await Cart.create({
        userId: user._id,
        items: [
          {
            program: program._id,
            quantity: 2,
            price: program.price
          }
        ]
      });
      itemId = cart.items[0]._id.toString();
    });

    test('should remove item from cart', async () => {
      const response = await request(app)
        .delete(`/api/cart/remove/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items).toHaveLength(0);
    });

    test('should reject removing non-existent item', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/cart/remove/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.msg).toContain('not found');
    });
  });

  describe('DELETE /api/cart/clear', () => {
    beforeEach(async () => {
      await Cart.create({
        userId: user._id,
        items: [
          {
            program: program._id,
            quantity: 2,
            price: program.price
          }
        ]
      });
    });

    test('should clear all items from cart', async () => {
      const response = await request(app)
        .delete('/api/cart/clear')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple items in cart', async () => {
      const program2 = await Program.create({
        title: 'Test Program 2',
        description: 'Test description 2',
        preview: 'Test preview 2',
        price: 79.99,
        duration: '8 weeks',
        level: 'Intermediate',
        frequency: '4 days per week',
        sessionLength: '60 minutes',
        slug: 'test-program-2'
      });

      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ programId: program._id.toString() });

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ programId: program2._id.toString() })
        .expect(200);

      expect(response.body.items).toHaveLength(2);
    });

    test('should handle large quantities', async () => {
      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${token}`)
        .send({
          programId: program._id.toString(),
          quantity: 999
        })
        .expect(200);

      expect(response.body.items[0].quantity).toBe(999);
    });
  });
});