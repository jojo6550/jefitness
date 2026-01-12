const request = require('supertest');
const app = require('../../src/server');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');
const { createOrRetrieveCustomer, createSubscription, getCustomerSubscriptions } = require('../../src/services/stripe');

// Mock Stripe service
jest.mock('../../src/services/stripe');

// Mock Stripe instance for getStripe()
const mockStripe = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_test123',
      email: 'test@example.com',
      deleted: false,
      invoice_settings: { default_payment_method: 'pm_test123' }
    })
  },
  paymentMethods: {
    attach: jest.fn().mockResolvedValue({ id: 'pm_test123' })
  }
};

// Mock the stripe module
jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

let userToken;
let userId;

describe('Subscriptions API', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create test user and generate token
    const user = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
      isEmailVerified: true,
      dataProcessingConsent: { given: true },
      healthDataConsent: { given: true },
    });
    await user.save();
    userId = user._id;
    
    // Generate JWT token
    userToken = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET);
    
    // Reset mockStripe
    mockStripe.customers.create.mockResolvedValue({
      id: 'cus_test123',
      email: 'test@example.com'
    });
    mockStripe.customers.retrieve.mockResolvedValue({
      id: 'cus_test123',
      email: 'test@example.com',
      deleted: false,
      invoice_settings: { default_payment_method: 'pm_test123' }
    });
    mockStripe.paymentMethods.attach.mockResolvedValue({ id: 'pm_test123' });
  });

  describe('POST /api/v1/subscriptions/create', () => {
    const validRequest = {
      email: 'test@example.com',
      paymentMethodId: 'pm_test123',
      plan: '1-month'
    };

    const mockCustomer = {
      id: 'cus_test123',
      email: 'test@example.com'
    };

    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      status: 'active',
      items: {
        data: [{
          price: {
            id: 'prod_TlkNETGd6OFrRf'
          }
        }]
      }
    };

    test('should create subscription successfully for 1-month plan', async () => {
      createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      createSubscription.mockResolvedValue(mockSubscription);

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subscription).toEqual(mockSubscription);
      expect(response.body.data.customer).toEqual({
        id: mockCustomer.id,
        email: mockCustomer.email
      });
      expect(createOrRetrieveCustomer).toHaveBeenCalledWith(
        validRequest.email,
        validRequest.paymentMethodId,
        expect.objectContaining({
          userId: userId.toString(),
          firstName: 'Test',
          lastName: 'User'
        })
      );
      expect(createSubscription).toHaveBeenCalledWith(mockCustomer.id, validRequest.plan);
    });

    test('should create subscription successfully for 3-month plan', async () => {
      const request3Month = { ...validRequest, plan: '3-month' };
      createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      createSubscription.mockResolvedValue(mockSubscription);

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(request3Month)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(createSubscription).toHaveBeenCalledWith(mockCustomer.id, '3-month');
    });

    test('should create subscription successfully for 6-month plan', async () => {
      const request6Month = { ...validRequest, plan: '6-month' };
      createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      createSubscription.mockResolvedValue(mockSubscription);

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(request6Month)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(createSubscription).toHaveBeenCalledWith(mockCustomer.id, '6-month');
    });

    test('should create subscription successfully for 12-month plan', async () => {
      const request12Month = { ...validRequest, plan: '12-month' };
      createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      createSubscription.mockResolvedValue(mockSubscription);

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(request12Month)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(createSubscription).toHaveBeenCalledWith(mockCustomer.id, '12-month');
    });

    test('should return 400 for invalid email', async () => {
      const invalidRequest = { ...validRequest, email: 'invalid-email' };

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
      expect(response.body.error.details).toBeDefined();
    });

    test('should return 400 for missing paymentMethodId', async () => {
      const invalidRequest = { email: validRequest.email, plan: validRequest.plan };

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
    });

    test('should return 400 for invalid plan', async () => {
      const invalidRequest = { ...validRequest, plan: 'invalid-plan' };

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
    });

    test('should return 500 for Stripe customer creation error', async () => {
      createOrRetrieveCustomer.mockRejectedValue(new Error('Stripe customer error'));

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to create subscription');
    });

    test('should return 500 for Stripe subscription creation error', async () => {
      createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      createSubscription.mockRejectedValue(new Error('Stripe subscription error'));

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to create subscription');
    });
  });

  describe('GET /api/v1/subscriptions/:customerId', () => {
    const customerId = 'cus_test123';
    const mockSubscriptions = [
      {
        id: 'sub_test123',
        customer: customerId,
        status: 'active',
        items: {
          data: [{
            price: {
              id: 'prod_TlkNETGd6OFrRf'
            }
          }]
        }
      },
      {
        id: 'sub_test456',
        customer: customerId,
        status: 'canceled',
        items: {
          data: [{
            price: {
              id: 'prod_TlkOMtyHdhvBXQ'
            }
          }]
        }
      }
    ];

    test('should retrieve customer subscriptions successfully', async () => {
      getCustomerSubscriptions.mockResolvedValue(mockSubscriptions);

      const response = await request(app)
        .get(`/api/v1/subscriptions/${customerId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subscriptions).toEqual(mockSubscriptions);
      expect(response.body.data.count).toBe(2);
      expect(getCustomerSubscriptions).toHaveBeenCalledWith(customerId);
    });

    test('should return 400 for invalid customerId', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
    });

    test('should return 500 for Stripe API error', async () => {
      getCustomerSubscriptions.mockRejectedValue(new Error('Stripe API error'));

      const response = await request(app)
        .get(`/api/v1/subscriptions/${customerId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to retrieve subscriptions');
    });
  });
});
