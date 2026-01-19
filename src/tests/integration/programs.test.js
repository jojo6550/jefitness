/**
 * Integration Tests for Program Marketplace
 * Tests program listing, purchase flow, ownership enforcement, and duplicate prevention
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/User');
const Program = require('../../models/Program');
const Purchase = require('../../models/Purchase');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_program_test123',
        email: 'test@example.com'
      })
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_program_test123',
          url: 'https://checkout.stripe.com/program-test'
        })
      }
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'price_program123',
        unit_amount: 4999,
        currency: 'usd'
      })
    },
    products: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'prod_program123',
        name: 'Test Program'
      })
    }
  }));
});

describe('Program Marketplace', () => {
  let testUser;
  let authToken;
  let testProgram;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'program@example.com',
      password: hashedPassword,
      isEmailVerified: true,
      stripeCustomerId: 'cus_program_test123',
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    authToken = jwt.sign(
      { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );

    // Create test program
    testProgram = await Program.create({
      title: 'Advanced Strength Training',
      slug: 'advanced-strength-training',
      author: 'John Doe',
      goals: 'Build muscle and increase strength',
      description: 'A comprehensive 12-week program',
      tags: ['strength', 'muscle-building', 'advanced'],
      stripeProductId: 'prod_program123',
      stripePriceId: 'price_program123',
      isActive: true,
      features: ['12 weeks of workouts', 'Nutrition guide', 'Video demonstrations'],
      difficulty: 'advanced',
      duration: '12 weeks',
      imageUrl: 'https://example.com/image.jpg'
    });
  });

  describe('GET /api/v1/programs', () => {
    beforeEach(async () => {
      // Create multiple programs
      await Program.create({
        title: 'Beginner Fitness',
        slug: 'beginner-fitness',
        author: 'Jane Smith',
        goals: 'Get started with fitness',
        tags: ['beginner', 'general-fitness'],
        stripeProductId: 'prod_beginner123',
        stripePriceId: 'price_beginner123',
        isActive: true,
        difficulty: 'beginner',
        duration: '8 weeks'
      });

      await Program.create({
        title: 'Inactive Program',
        slug: 'inactive-program',
        author: 'Test Author',
        goals: 'Test',
        stripeProductId: 'prod_inactive123',
        stripePriceId: 'price_inactive123',
        isActive: false,
        difficulty: 'intermediate',
        duration: '4 weeks'
      });
    });

    test('should list active programs', async () => {
      const response = await request(app)
        .get('/api/v1/programs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.programs).toBeDefined();
      expect(response.body.programs.length).toBeGreaterThan(0);

      // Should only include active programs
      response.body.programs.forEach(program => {
        expect(program.isActive).toBe(true);
      });
    });

    test('should not require authentication for listing', async () => {
      const response = await request(app)
        .get('/api/v1/programs')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should support filtering by difficulty', async () => {
      const response = await request(app)
        .get('/api/v1/programs?difficulty=beginner')
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.programs.forEach(program => {
        expect(program.difficulty).toBe('beginner');
      });
    });

    test('should support search by title', async () => {
      const response = await request(app)
        .get('/api/v1/programs?search=Strength')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.programs.length).toBeGreaterThan(0);
      expect(response.body.programs[0].title).toContain('Strength');
    });

    test('should support filtering by tags', async () => {
      const response = await request(app)
        .get('/api/v1/programs?tags=beginner')
        .expect(200);

      expect(response.body.success).toBe(true);
      if (response.body.programs.length > 0) {
        expect(response.body.programs[0].tags).toContain('beginner');
      }
    });
  });

  describe('GET /api/v1/programs/:slug', () => {
    test('should get program details by slug', async () => {
      const response = await request(app)
        .get(`/api/v1/programs/${testProgram.slug}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.program.title).toBe(testProgram.title);
      expect(response.body.program.author).toBe(testProgram.author);
      expect(response.body.program.features).toEqual(testProgram.features);
    });

    test('should return 404 for non-existent program', async () => {
      const response = await request(app)
        .get('/api/v1/programs/non-existent-slug')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should return 404 for inactive program', async () => {
      const inactiveProgram = await Program.create({
        title: 'Inactive Test',
        slug: 'inactive-test',
        author: 'Test',
        goals: 'Test',
        stripeProductId: 'prod_test',
        stripePriceId: 'price_test',
        isActive: false
      });

      const response = await request(app)
        .get(`/api/v1/programs/${inactiveProgram.slug}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should not require authentication for viewing', async () => {
      const response = await request(app)
        .get(`/api/v1/programs/${testProgram.slug}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/programs/:slug/purchase', () => {
    test('should create purchase for program', async () => {
      const response = await request(app)
        .post(`/api/v1/programs/${testProgram.slug}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.checkoutUrl).toContain('stripe.com');

      // Verify purchase record was created
      const purchase = await Purchase.findOne({
        userId: testUser._id,
        'items.productKey': testProgram.slug
      });

      expect(purchase).toBeTruthy();
      expect(purchase.status).toBe('pending');
    });

    test('should require authentication', async () => {
      await request(app)
        .post(`/api/v1/programs/${testProgram.slug}/purchase`)
        .expect(401);
    });

    test('should reject purchase of non-existent program', async () => {
      const response = await request(app)
        .post('/api/v1/programs/non-existent/purchase')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should reject purchase of inactive program', async () => {
      const inactiveProgram = await Program.create({
        title: 'Inactive Purchase Test',
        slug: 'inactive-purchase',
        author: 'Test',
        goals: 'Test',
        stripeProductId: 'prod_inactive',
        stripePriceId: 'price_inactive',
        isActive: false
      });

      const response = await request(app)
        .post(`/api/v1/programs/${inactiveProgram.slug}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not available');
    });

    test('should prevent duplicate purchases', async () => {
      // Add program to user's purchased programs
      testUser.purchasedPrograms = [testProgram._id];
      await testUser.save();

      const response = await request(app)
        .post(`/api/v1/programs/${testProgram.slug}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already purchased');
    });

    test('should create Stripe customer if missing', async () => {
      // Create user without Stripe customer
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const newUser = await User.create({
        firstName: 'New',
        lastName: 'User',
        email: 'newprogram@example.com',
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
        .post(`/api/v1/programs/${testProgram.slug}/purchase`)
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Stripe customer was created
      const updatedUser = await User.findById(newUser._id);
      expect(updatedUser.stripeCustomerId).toBeDefined();
    });
  });

  describe('GET /api/v1/programs/my-programs', () => {
    beforeEach(async () => {
      // Add purchased program to user
      testUser.purchasedPrograms = [testProgram._id];
      await testUser.save();
    });

    test('should get user purchased programs', async () => {
      const response = await request(app)
        .get('/api/v1/programs/my-programs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.programs).toHaveLength(1);
      expect(response.body.programs[0]._id).toBe(testProgram._id.toString());
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/v1/programs/my-programs')
        .expect(401);
    });

    test('should return empty array for users without purchases', async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const newUser = await User.create({
        firstName: 'New',
        lastName: 'User',
        email: 'noprograms@example.com',
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
        .get('/api/v1/programs/my-programs')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.programs).toHaveLength(0);
    });
  });

  describe('Ownership Enforcement', () => {
    let paidProgram;

    beforeEach(async () => {
      paidProgram = await Program.create({
        title: 'Premium Program',
        slug: 'premium-program',
        author: 'Expert Coach',
        goals: 'Advanced training',
        stripeProductId: 'prod_premium123',
        stripePriceId: 'price_premium123',
        isActive: true,
        difficulty: 'advanced',
        duration: '16 weeks'
      });
    });

    test('should allow access to purchased program content', async () => {
      // Add program to user's purchases
      testUser.purchasedPrograms = [paidProgram._id];
      await testUser.save();

      const response = await request(app)
        .get(`/api/v1/programs/${paidProgram.slug}/content`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.content).toBeDefined();
    });

    test('should deny access to unpurchased program content', async () => {
      const response = await request(app)
        .get(`/api/v1/programs/${paidProgram.slug}/content`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Purchase required');
    });

    test('should prevent cross-user access to program content', async () => {
      // Create another user who owns the program
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const ownerUser = await User.create({
        firstName: 'Owner',
        lastName: 'User',
        email: 'owner@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        purchasedPrograms: [paidProgram._id],
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      // Try to access with different user
      const response = await request(app)
        .get(`/api/v1/programs/${paidProgram.slug}/content`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Webhook - Program Purchase Completion', () => {
    test('should add program to user on successful payment', async () => {
      // Create pending purchase
      const purchase = await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_program_test123',
        stripeCheckoutSessionId: 'cs_program_complete123',
        status: 'pending',
        items: [
          {
            productKey: testProgram.slug,
            name: testProgram.title,
            quantity: 1,
            unitPrice: 4999,
            totalPrice: 4999
          }
        ],
        totalAmount: 4999,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_program_purchase123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_program_complete123',
            customer: 'cus_program_test123',
            mode: 'payment',
            payment_intent: 'pi_program123',
            payment_status: 'paid',
            metadata: {
              programId: testProgram._id.toString()
            }
          }
        }
      };

      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      // Verify purchase was completed
      const updatedPurchase = await Purchase.findById(purchase._id);
      expect(updatedPurchase.status).toBe('completed');

      // Verify program was added to user
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.purchasedPrograms).toContainEqual(testProgram._id);
    });

    test('should not duplicate programs on webhook retry', async () => {
      // Add program once
      testUser.purchasedPrograms = [testProgram._id];
      await testUser.save();

      const purchase = await Purchase.create({
        userId: testUser._id,
        stripeCustomerId: 'cus_program_test123',
        stripeCheckoutSessionId: 'cs_duplicate_test123',
        status: 'pending',
        items: [{ productKey: testProgram.slug, quantity: 1 }],
        totalAmount: 4999,
        billingEnvironment: 'test'
      });

      const webhookEvent = {
        id: 'evt_duplicate_program123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_duplicate_test123',
            payment_status: 'paid',
            metadata: { programId: testProgram._id.toString() }
          }
        }
      };

      await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test-signature')
        .send(webhookEvent)
        .expect(200);

      // Should still have only one instance
      const updatedUser = await User.findById(testUser._id);
      const programCount = updatedUser.purchasedPrograms.filter(
        id => id.toString() === testProgram._id.toString()
      ).length;

      expect(programCount).toBe(1);
    });
  });
});
