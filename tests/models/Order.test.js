const Order = require('../../src/models/Order');
const User = require('../../src/models/User');
const Program = require('../../src/models/Program');
const mongoose = require('mongoose');

describe('Order Model', () => {
  let testUser;
  let testProgram;

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'Test123!@#'
    });

    // Create test program
    testProgram = await Program.create({
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
  });

  describe('Schema Validation', () => {
    test('should create a valid order with all required fields', async () => {
      const orderData = {
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: testProgram.price
          }
        ],
        subtotal: 49.99,
        tax: 4.00,
        total: 53.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com',
          phone: '1234567890',
          address: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        }
      };

      const order = new Order(orderData);
      const savedOrder = await order.save();

      expect(savedOrder._id).toBeDefined();
      expect(savedOrder.orderNumber).toBe(orderData.orderNumber);
      expect(savedOrder.status).toBe('pending');
      expect(savedOrder.items).toHaveLength(1);
      expect(savedOrder.total).toBe(53.99);
    });

    test('should fail validation when required fields are missing', async () => {
      const order = new Order({});

      let error;
      try {
        await order.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.user).toBeDefined();
      expect(error.errors.orderNumber).toBeDefined();
    });

    test('should enforce unique order number', async () => {
      const orderData = {
        user: testUser._id,
        orderNumber: 'ORD-UNIQUE-123',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      };

      await new Order(orderData).save();

      const duplicateOrder = new Order(orderData);
      let error;
      try {
        await duplicateOrder.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000);
    });

    test('should validate item price is positive', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: -10
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      let error;
      try {
        await order.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });

    test('should validate item quantity is at least 1', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 0,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      let error;
      try {
        await order.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });

    test('should validate zip code format', async () => {
      const invalidZipCodes = ['1234', 'abcde', '123456', '12345-', '-1234'];

      for (const zipCode of invalidZipCodes) {
        const order = new Order({
          user: testUser._id,
          orderNumber: `ORD-${Math.random()}`,
          items: [
            {
              program: testProgram._id,
              title: testProgram.title,
              quantity: 1,
              price: 49.99
            }
          ],
          subtotal: 49.99,
          total: 49.99,
          paymentMethod: 'credit_card',
          billingInfo: {
            fullName: 'John Doe',
            email: 'john@example.com',
            zipCode
          }
        });

        let error;
        try {
          await order.save();
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.errors['billingInfo.zipCode']).toBeDefined();
      }
    });

    test('should accept valid zip code formats', async () => {
      const validZipCodes = ['12345', '12345-6789'];

      for (const zipCode of validZipCodes) {
        const order = new Order({
          user: testUser._id,
          orderNumber: `ORD-${Math.random()}`,
          items: [
            {
              program: testProgram._id,
              title: testProgram.title,
              quantity: 1,
              price: 49.99
            }
          ],
          subtotal: 49.99,
          total: 49.99,
          paymentMethod: 'credit_card',
          billingInfo: {
            fullName: 'John Doe',
            email: 'john@example.com',
            zipCode
          }
        });

        const savedOrder = await order.save();
        expect(savedOrder.billingInfo.zipCode).toBe(zipCode);
      }
    });
  });

  describe('Order Status', () => {
    test('should default status to pending', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      const savedOrder = await order.save();
      expect(savedOrder.status).toBe('pending');
    });

    test('should validate status enum values', async () => {
      const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];

      for (const status of validStatuses) {
        const order = new Order({
          user: testUser._id,
          orderNumber: `ORD-${Math.random()}`,
          items: [
            {
              program: testProgram._id,
              title: testProgram.title,
              quantity: 1,
              price: 49.99
            }
          ],
          subtotal: 49.99,
          total: 49.99,
          paymentMethod: 'credit_card',
          billingInfo: {
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          status
        });

        const savedOrder = await order.save();
        expect(savedOrder.status).toBe(status);
      }
    });

    test('should reject invalid status values', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        },
        status: 'invalid_status'
      });

      let error;
      try {
        await order.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.status).toBeDefined();
    });
  });

  describe('Pre-save Hooks', () => {
    test('should validate user exists before saving', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId();
      const order = new Order({
        user: nonExistentUserId,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      let error;
      try {
        await order.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Referenced user does not exist');
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple items in order', async () => {
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

      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 2,
            price: 49.99
          },
          {
            program: program2._id,
            title: program2.title,
            quantity: 1,
            price: 79.99
          }
        ],
        subtotal: 179.97,
        tax: 14.40,
        total: 194.37,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      const savedOrder = await order.save();
      expect(savedOrder.items).toHaveLength(2);
      expect(savedOrder.items[0].quantity).toBe(2);
    });

    test('should handle zero tax', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        tax: 0,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
        }
      });

      const savedOrder = await order.save();
      expect(savedOrder.tax).toBe(0);
    });

    test('should handle optional billing fields', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'ORD-123456',
        items: [
          {
            program: testProgram._id,
            title: testProgram.title,
            quantity: 1,
            price: 49.99
          }
        ],
        subtotal: 49.99,
        total: 49.99,
        paymentMethod: 'credit_card',
        billingInfo: {
          fullName: 'John Doe',
          email: 'john@example.com'
          // Optional fields omitted
        }
      });

      const savedOrder = await order.save();
      expect(savedOrder.billingInfo.phone).toBeUndefined();
      expect(savedOrder.billingInfo.address).toBeUndefined();
    });
  });
});