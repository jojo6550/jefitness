// tests/stripe.test.js - Unit tests for Stripe integration
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const app = require('../src/server');

// ============================================
// MOCK STRIPE - Using var to avoid TDZ issues
// ============================================
// Note: Using var instead of const because Jest hoists jest.mock() to the top.
// var is hoisted and initialized (not in TDZ), so the mock factory can reference
// these variables before the actual const declarations run.

var mockCustomersUpdate;
var mockCustomersList;
var mockCustomersCreate;
var mockCustomersRetrieve;
var mockSubscriptionsCreate;
var mockSubscriptionsList;
var mockSubscriptionsRetrieve;
var mockSubscriptionsUpdate;
var mockSubscriptionsDel;
var mockCheckoutSessionsCreate;
var mockInvoicesList;
var mockPaymentMethodsList;
var mockWebhooksConstructEvent;
var mockPricesList;
var mockPricesRetrieve;
var mockProductsRetrieve;
var mockProgramsFindById;
var mockProgramsFindOne;
var mockProgramsFind;

// Initialize mocks - these will overwrite the var declarations with const
mockCustomersUpdate = jest.fn();
mockCustomersList = jest.fn().mockResolvedValue({ data: [] });
mockCustomersCreate = jest.fn().mockResolvedValue({
  id: 'cus_test123',
  email: 'test@example.com'
});
mockCustomersRetrieve = jest.fn().mockResolvedValue({
  id: 'cus_test123',
  email: 'test@example.com'
});
mockSubscriptionsCreate = jest.fn().mockResolvedValue({
  id: 'sub_test123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000,
  items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
});
mockSubscriptionsList = jest.fn().mockResolvedValue({
  data: [{
    id: 'sub_test123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 2592000
  }]
});
mockSubscriptionsRetrieve = jest.fn().mockResolvedValue({
  id: 'sub_test123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000
});
mockSubscriptionsUpdate = jest.fn().mockResolvedValue({
  id: 'sub_test123',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: Math.floor(Date.now() / 1000) + 2592000
});
mockSubscriptionsDel = jest.fn().mockResolvedValue({
  id: 'sub_test123',
  status: 'canceled',
  cancel_at_period_end: false,
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000,
  items: { data: [{ id: 'si_test123', price: { id: 'price_test123' } }] }
});
mockCheckoutSessionsCreate = jest.fn().mockResolvedValue({
  id: 'cs_test123',
  url: 'https://checkout.stripe.com/test123'
});
mockInvoicesList = jest.fn().mockResolvedValue({ data: [] });
mockPaymentMethodsList = jest.fn().mockResolvedValue({ data: [] });
mockWebhooksConstructEvent = jest.fn();
mockPricesList = jest.fn().mockResolvedValue({
  data: [{
    id: 'price_test123',
    product: 'prod_test123',
    unit_amount: 999,
    recurring: { interval: 'month' }
  }]
});
mockPricesRetrieve = jest.fn().mockResolvedValue({
  id: 'price_test123',
  unit_amount: 999,
  currency: 'usd'
});
mockProductsRetrieve = jest.fn().mockResolvedValue({
  id: 'prod_test123',
  name: 'Test Product'
});
mockProgramsFindById = jest.fn().mockResolvedValue({
  _id: 'prog_test123',
  title: 'Test Program',
  slug: 'test-program',
  price: 49.99,
  description: 'A test program',
  isPublished: true,
  isActive: true
});
mockProgramsFindOne = jest.fn().mockResolvedValue({
  _id: 'prog_test123',
  title: 'Test Program',
  slug: 'test-program',
  price: 49.99,
  description: 'A test program',
  isPublished: true,
  isActive: true
});
mockProgramsFind = jest.fn().mockResolvedValue([{
  _id: 'prog_test123',
  title: 'Test Program',
  slug: 'test-program',
  price: 49.99,
  description: 'A test program',
  isPublished: true,
  isActive: true
}]);

// Mock Program model
jest.mock('../src/models/Program', () => ({
  findById: mockProgramsFindById,
  findOne: mockProgramsFindOne,
  find: mockProgramsFind
}));

// Mock stripe module - must be hoisted but references are already declared as var
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      list: mockCustomersList,
      create: mockCustomersCreate,
      retrieve: mockCustomersRetrieve,
      update: mockCustomersUpdate
    },
    subscriptions: {
      create: mockSubscriptionsCreate,
      list: mockSubscriptionsList,
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
      del: mockSubscriptionsDel
    },
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate
      }
    },
    invoices: {
      list: mockInvoicesList
    },
    paymentMethods: {
      list: mockPaymentMethodsList
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent
    },
    prices: {
      list: mockPricesList,
      retrieve: mockPricesRetrieve
    },
    products: {
      retrieve: mockProductsRetrieve
    }
  }));
});

// ============================================
// TEST SETUP - Uses global setup from tests/setup.js
// ============================================

// Declare test variables at the top level
let testUser;
let authToken;

beforeEach(async () => {
  // Reset all mocks before each test
  mockCustomersUpdate.mockResolvedValue({
    id: 'cus_test123',
    email: 'test@example.com'
  });
  
  // Clear all mock call history
  jest.clearAllMocks();
  
  // Create test user
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

  testUser = new User({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: hashedPassword,
    isEmailVerified: true,
    role: 'user'
  });

  await testUser.save();

  // Generate auth token
  const jwt = require('jsonwebtoken');
  authToken = jwt.sign({ id: testUser._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterEach(async () => {
  // Clean up database
  await User.deleteMany({});
  await Subscription.deleteMany({});
});

// ============================================
// TEST SUITES
// ============================================

describe('Stripe Subscription System', () => {
  describe('GET /api/v1/subscriptions/plans', () => {
    it('should return all subscription plans', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.plans).toBeDefined();
      expect(response.body.data.free).toBeDefined();
    });

    it('should include all plan tiers', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/plans')
        .expect(200);

      const plans = response.body.data.plans;
      expect(plans['1-month']).toBeDefined();
      expect(plans['3-month']).toBeDefined();
      expect(plans['6-month']).toBeDefined();
      expect(plans['12-month']).toBeDefined();
    });
  });

  describe('POST /api/v1/subscriptions/checkout-session', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate plan is valid', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: 'invalid-plan',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should require complete account information', async () => {
      // Create user with valid data first
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

      const incompleteUser = new User({
        firstName: 'Incomplete',
        lastName: 'User',
        email: 'incomplete@example.com',
        password: hashedPassword,
        isEmailVerified: true
      });
      await incompleteUser.save();

      // Now update to have empty names (bypassing model validation)
      await User.findByIdAndUpdate(incompleteUser._id, {
        firstName: '',
        lastName: ''
      });

      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ id: incompleteUser._id }, process.env.JWT_SECRET);

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(400);

      expect(response.body.error.message).toContain('account information');
      expect(response.body.error.requiredFields).toBeDefined();
    });

    it('should create checkout session for authenticated user', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.url).toBeDefined();
    });

    it('should save Stripe customer ID to user', async () => {
      await request(app)
        .post('/api/v1/subscriptions/checkout-session')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: '1-month',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel'
        })
        .expect(200);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.stripeCustomerId).toBeDefined();
      expect(updatedUser.billingEnvironment).toMatch(/test|production/);
    });
  });

  describe('GET /api/v1/subscriptions/user/current', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/user/current')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return free tier for user without subscription', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/user/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSubscription).toBe(false);
      expect(response.body.data.plan).toBe('free');
    });

    it('should return active subscription details', async () => {
      // Create a subscription for the user
      const subscription = new Subscription({
        userId: testUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_test123',
        plan: '1-month',
        amount: 999,
        currency: 'usd',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingEnvironment: 'test'
      });
      await subscription.save();

      // Update user with subscription
      testUser.subscriptionId = 'sub_test123';
      testUser.subscriptionStatus = 'active';
      testUser.subscriptionPlan = '1-month';
      await testUser.save();

      const response = await request(app)
        .get('/api/v1/subscriptions/user/current')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSubscription).toBe(true);
      expect(response.body.data.plan).toBe('1-month');
      expect(response.body.data.status).toBe('active');
    });
  });

  describe('Account Information Endpoints', () => {
    let accountToken;
    let accountUser;

    beforeEach(async () => {
      // Create fresh user for account tests
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

      accountUser = new User({
        firstName: 'Account',
        lastName: 'Test',
        email: 'account@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        role: 'user'
      });

      await accountUser.save();

      const jwt = require('jsonwebtoken');
      accountToken = jwt.sign({ id: accountUser._id }, process.env.JWT_SECRET);
    });

    describe('GET /api/v1/auth/account', () => {
      it('should return account information', async () => {
        const response = await request(app)
          .get('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .expect(200);

        expect(response.body.firstName).toBe('Account');
        expect(response.body.lastName).toBe('Test');
        expect(response.body.email).toBe('account@example.com');
        expect(response.body.subscriptionStatus).toBeDefined();
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/v1/auth/account')
          .expect(401);

        expect(response.body.error).toBeDefined();
      });
    });

    describe('PUT /api/v1/auth/account', () => {
      it('should update user name', async () => {
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            firstName: 'Updated',
            lastName: 'Name'
          })
          .expect(200);

        expect(response.body.msg).toContain('updated');
        expect(response.body.user.firstName).toBe('Updated');
        expect(response.body.user.lastName).toBe('Name');
      });

      it('should update email and sync with Stripe', async () => {
        // First create Stripe customer
        accountUser.stripeCustomerId = 'cus_test123';
        await accountUser.save();

        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            email: 'newemail@example.com'
          })
          .expect(200);

        expect(response.body.user.email).toBe('newemail@example.com');

        // Verify Stripe was updated
        expect(mockCustomersUpdate).toHaveBeenCalled();
      });

      it('should prevent duplicate email', async () => {
        // Create another user with different email
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

        const otherUser = new User({
          firstName: 'Other',
          lastName: 'User',
          email: 'other@example.com',
          password: hashedPassword,
          isEmailVerified: true
        });
        await otherUser.save();

        // Try to update account user's email to existing email
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            email: 'other@example.com'
          })
          .expect(400);

        expect(response.body.msg).toContain('already in use');
      });

      it('should update password with validation', async () => {
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            currentPassword: 'TestPassword123!',
            newPassword: 'NewPassword456!'
          })
          .expect(200);

        expect(response.body.msg).toContain('updated');
      });

      it('should reject weak passwords', async () => {
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            currentPassword: 'TestPassword123!',
            newPassword: 'weak'
          })
          .expect(400);

        expect(response.body.msg).toBeDefined();
      });

      it('should require current password to change password', async () => {
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            newPassword: 'NewPassword456!'
          })
          .expect(400);

        expect(response.body.msg).toContain('Current password');
      });

      it('should validate current password', async () => {
        const response = await request(app)
          .put('/api/v1/auth/account')
          .set('Authorization', `Bearer ${accountToken}`)
          .send({
            currentPassword: 'WrongPassword123!',
            newPassword: 'NewPassword456!'
          })
          .expect(400);

        expect(response.body.msg).toContain('incorrect');
    });
  });

  describe('Program Payment System', () => {
    describe('POST /api/v1/programs/:programId/checkout-session', () => {
      it('should require authentication', async () => {
        const response = await request(app)
          .post('/api/v1/programs/prog_test123/checkout-session')
          .send({
            successUrl: 'http://localhost:3000/success',
            cancelUrl: 'http://localhost:3000/cancel'
          })
          .expect(401);

        expect(response.body.error).toBeDefined();
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/programs/prog_test123/checkout-session')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            // Missing required fields
          })
          .expect(400);

        expect(response.body.error).toBeDefined();
      });

      it('should validate program exists', async () => {
        mockProgramsFindById.mockResolvedValueOnce(null);

        const response = await request(app)
          .post('/api/v1/programs/invalid_program/checkout-session')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            successUrl: 'http://localhost:3000/success',
            cancelUrl: 'http://localhost:3000/cancel'
          })
          .expect(404);

        expect(response.body.error).toBeDefined();
      });

      it('should require complete account information', async () => {
        // Create user with valid data first
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

        const incompleteUser = new User({
          firstName: 'Incomplete',
          lastName: 'User',
          email: 'incomplete@example.com',
          password: hashedPassword,
          isEmailVerified: true
        });
        await incompleteUser.save();

        // Now update to have empty names (bypassing model validation)
        await User.findByIdAndUpdate(incompleteUser._id, {
          firstName: '',
          lastName: ''
        });

        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ id: incompleteUser._id }, process.env.JWT_SECRET);

        const response = await request(app)
          .post('/api/v1/programs/prog_test123/checkout-session')
          .set('Authorization', `Bearer ${token}`)
          .send({
            successUrl: 'http://localhost:3000/success',
            cancelUrl: 'http://localhost:3000/cancel'
          })
          .expect(400);

        expect(response.body.error.message).toContain('account information');
        expect(response.body.error.requiredFields).toBeDefined();
      });

      it('should create checkout session for authenticated user', async () => {
        const response = await request(app)
          .post('/api/v1/programs/prog_test123/checkout-session')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            successUrl: 'http://localhost:3000/success',
            cancelUrl: 'http://localhost:3000/cancel'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sessionId).toBeDefined();
        expect(response.body.data.url).toBeDefined();
      });

      it('should save Stripe customer ID to user', async () => {
        await request(app)
          .post('/api/v1/programs/prog_test123/checkout-session')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            successUrl: 'http://localhost:3000/success',
            cancelUrl: 'http://localhost:3000/cancel'
          })
          .expect(200);

        const updatedUser = await User.findById(testUser._id);
        expect(updatedUser.stripeCustomerId).toBeDefined();
        expect(updatedUser.billingEnvironment).toMatch(/test|production/);
      });
    });

    describe('GET /api/v1/programs/my', () => {
      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/v1/programs/my')
          .expect(401);

        expect(response.body.error).toBeDefined();
      });

      it('should return empty array for user with no programs', async () => {
        const response = await request(app)
          .get('/api/v1/programs/my')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
      });

      it('should return user assigned programs', async () => {
        // Add program to user's assignedPrograms
        testUser.assignedPrograms = [{
          programId: 'prog_test123',
          assignedAt: new Date()
        }];
        await testUser.save();

        const response = await request(app)
          .get('/api/v1/programs/my')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].programId).toBe('prog_test123');
        expect(response.body.data[0].title).toBe('Test Program');
        expect(response.body.data[0].slug).toBe('test-program');
      });
    });

    describe('Webhook - Program Assignment', () => {
      it('should assign program to user on successful payment', async () => {
        // Set stripe customer ID for test user
        testUser.stripeCustomerId = 'cus_test123';
        await testUser.save();

        // Mock webhook event for program payment completion
        const webhookEvent = {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test123',
              mode: 'payment',
              customer: 'cus_test123',
              metadata: {
                programId: 'prog_test123'
              }
            }
          }
        };

        mockWebhooksConstructEvent.mockReturnValueOnce(webhookEvent);

        const response = await request(app)
          .post('/api/v1/webhooks/stripe')
          .set('stripe-signature', 'test_signature')
          .send(webhookEvent)
          .expect(200);

        expect(response.text).toBe('Webhook received');

        // Verify user was updated with program
        const updatedUser = await User.findById(testUser._id);
        expect(updatedUser.assignedPrograms).toHaveLength(1);
        expect(updatedUser.assignedPrograms[0].programId).toBe('prog_test123');
        expect(updatedUser.assignedPrograms[0].assignedAt).toBeDefined();
      });

      it('should not duplicate program assignment', async () => {
        // Set stripe customer ID for test user
        testUser.stripeCustomerId = 'cus_test123';

        // First assign program to user
        testUser.assignedPrograms = [{
          programId: 'prog_test123',
          assignedAt: new Date()
        }];
        await testUser.save();

        // Mock webhook event for same program payment completion
        const webhookEvent = {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test123',
              mode: 'payment',
              customer: 'cus_test123',
              metadata: {
                programId: 'prog_test123'
              }
            }
          }
        };

        mockWebhooksConstructEvent.mockReturnValueOnce(webhookEvent);

        const response = await request(app)
          .post('/api/v1/webhooks/stripe')
          .set('stripe-signature', 'test_signature')
          .send(webhookEvent)
          .expect(200);

        expect(response.text).toBe('Webhook received');

        // Verify program was not duplicated
        const updatedUser = await User.findById(testUser._id);
        expect(updatedUser.assignedPrograms).toHaveLength(1);
        expect(updatedUser.assignedPrograms[0].programId).toBe('prog_test123');
      });

      it('should handle subscription webhooks normally', async () => {
        // Mock webhook event for subscription payment completion
        const webhookEvent = {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test123',
              mode: 'subscription',
              customer: 'cus_test123',
              subscription: 'sub_test123'
            }
          }
        };

        mockWebhooksConstructEvent.mockReturnValueOnce(webhookEvent);

        const response = await request(app)
          .post('/api/v1/webhooks/stripe')
          .set('stripe-signature', 'test_signature')
          .send(webhookEvent)
          .expect(200);

        expect(response.text).toBe('Webhook received');
      });
    });
  });
});

  describe('Subscription Management', () => {
    let subToken;
    let subUser;
    let userSubscription;

    beforeEach(async () => {
      // Create user with subscription
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

      subUser = new User({
        firstName: 'Sub',
        lastName: 'User',
        email: 'subuser@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        stripeCustomerId: 'cus_test123',
        subscriptionId: 'sub_test123',
        subscriptionStatus: 'active',
        subscriptionPlan: '1-month'
      });

      await subUser.save();

      userSubscription = new Subscription({
        userId: subUser._id,
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_test123',
        plan: '1-month',
        amount: 999,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      await userSubscription.save();

      const jwt = require('jsonwebtoken');
      subToken = jwt.sign({ id: subUser._id }, process.env.JWT_SECRET);
    });

    describe('DELETE /api/v1/subscriptions/:subscriptionId/cancel', () => {
      it('should cancel subscription at period end', async () => {
        const response = await request(app)
          .delete('/api/v1/subscriptions/sub_test123/cancel')
          .set('Authorization', `Bearer ${subToken}`)
          .send({
            atPeriodEnd: true
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.subscription.cancelAtPeriodEnd).toBe(true);
      });

      it('should cancel subscription immediately', async () => {
        const response = await request(app)
          .delete('/api/v1/subscriptions/sub_test123/cancel')
          .set('Authorization', `Bearer ${subToken}`)
          .send({
            atPeriodEnd: false
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.subscription.status).toBe('canceled');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .delete('/api/v1/subscriptions/sub_test123/cancel')
          .send({
            atPeriodEnd: true
          })
          .expect(401);

        expect(response.body.error).toBeDefined();
      });

      it('should prevent user from canceling others subscriptions', async () => {
        // Create another user with valid password
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('TestPassword123!', salt);

        const otherUser = new User({
          firstName: 'Other',
          lastName: 'User',
          email: 'otheruser@example.com',
          password: hashedPassword,
          isEmailVerified: true
        });
        await otherUser.save();

        const jwt = require('jsonwebtoken');
        const otherToken = jwt.sign({ id: otherUser._id }, process.env.JWT_SECRET);

        const response = await request(app)
          .delete('/api/v1/subscriptions/sub_test123/cancel')
          .set('Authorization', `Bearer ${otherToken}`)
          .send({
            atPeriodEnd: true
          })
          .expect(404);

        expect(response.body.error).toBeDefined();
      });
    });

    describe('POST /api/v1/subscriptions/:subscriptionId/resume', () => {
      it('should resume canceled subscription', async () => {
        // Mark subscription as canceled first
        userSubscription.status = 'canceled';
        userSubscription.cancelAtPeriodEnd = true;
        await userSubscription.save();

        const response = await request(app)
          .post('/api/v1/subscriptions/sub_test123/resume')
          .set('Authorization', `Bearer ${subToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.subscription.cancelAtPeriodEnd).toBe(false);
      });
    });
  });
});

