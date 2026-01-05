const Cart = require('../../src/models/Cart');
const User = require('../../src/models/User');
const Program = require('../../src/models/Program');

describe('Cart Model', () => {
  let testUser;
  let testProgram;

  beforeEach(async () => {
    testUser = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'Test123!@#'
    });

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
    test('should create a valid cart', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 1,
            price: testProgram.price
          }
        ]
      });

      const savedCart = await cart.save();
      expect(savedCart._id).toBeDefined();
      expect(savedCart.userId.toString()).toBe(testUser._id.toString());
      expect(savedCart.items).toHaveLength(1);
    });

    test('should enforce unique userId constraint', async () => {
      await Cart.create({
        userId: testUser._id,
        items: []
      });

      const duplicateCart = new Cart({
        userId: testUser._id,
        items: []
      });

      let error;
      try {
        await duplicateCart.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000);
    });

    test('should validate quantity is at least 1', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 0,
            price: 49.99
          }
        ]
      });

      let error;
      try {
        await cart.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });

    test('should default quantity to 1', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            price: 49.99
          }
        ]
      });

      const savedCart = await cart.save();
      expect(savedCart.items[0].quantity).toBe(1);
    });
  });

  describe('Pre-save Hooks', () => {
    test('should update updatedAt timestamp on save', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: []
      });

      const savedCart = await cart.save();
      const firstUpdate = savedCart.updatedAt;

      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 10));
      savedCart.items.push({
        program: testProgram._id,
        quantity: 1,
        price: 49.99
      });

      const updatedCart = await savedCart.save();
      expect(updatedCart.updatedAt.getTime()).toBeGreaterThan(firstUpdate.getTime());
    });
  });

  describe('Cart Operations', () => {
    test('should allow empty cart', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: []
      });

      const savedCart = await cart.save();
      expect(savedCart.items).toEqual([]);
    });

    test('should handle multiple items', async () => {
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

      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 2,
            price: 49.99
          },
          {
            program: program2._id,
            quantity: 1,
            price: 79.99
          }
        ]
      });

      const savedCart = await cart.save();
      expect(savedCart.items).toHaveLength(2);
      expect(savedCart.items[0].quantity).toBe(2);
      expect(savedCart.items[1].quantity).toBe(1);
    });

    test('should allow removing items', async () => {
      const cart = await Cart.create({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 1,
            price: 49.99
          }
        ]
      });

      cart.items = [];
      const updatedCart = await cart.save();
      expect(updatedCart.items).toEqual([]);
    });

    test('should allow updating quantity', async () => {
      const cart = await Cart.create({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 1,
            price: 49.99
          }
        ]
      });

      cart.items[0].quantity = 3;
      const updatedCart = await cart.save();
      expect(updatedCart.items[0].quantity).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle large quantities', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 999,
            price: 49.99
          }
        ]
      });

      const savedCart = await cart.save();
      expect(savedCart.items[0].quantity).toBe(999);
    });

    test('should handle decimal prices', async () => {
      const cart = new Cart({
        userId: testUser._id,
        items: [
          {
            program: testProgram._id,
            quantity: 1,
            price: 49.99
          }
        ]
      });

      const savedCart = await cart.save();
      expect(savedCart.items[0].price).toBe(49.99);
    });
  });
});