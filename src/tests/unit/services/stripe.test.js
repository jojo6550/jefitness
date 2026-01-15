/**
 * Unit Tests for Stripe Service
 * Tests all functions in src/services/stripe.js
 * Mocks Stripe API calls to prevent real transactions
 */

// Mock Stripe first
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
    },
    prices: {
      list: jest.fn(),
      retrieve: jest.fn(),
    },
    products: {
      retrieve: jest.fn(),
      list: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
      list: jest.fn(),
      detach: jest.fn(),
    },
    paymentIntents: {
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
  }));
});

const stripe = require('stripe');
const mockStripe = stripe();

// Mock the stripe service module
jest.mock('../../../services/stripe', () => {
  const originalModule = jest.requireActual('../../../services/stripe');
  return {
    ...originalModule,
    getStripe: jest.fn(() => mockStripe),
    PRODUCT_MAP: {
      'seamoss-small': {
        productId: 'prod_seamoss_small',
        priceId: 'price_seamoss_small',
        name: 'Seamoss - Small Size'
      },
      'seamoss-large': {
        productId: 'prod_seamoss_large',
        priceId: 'price_seamoss_large',
        name: 'Seamoss - Large Size'
      },
      'coconut-water': {
        productId: 'prod_coconut_water',
        priceId: 'price_coconut_water',
        name: 'Coconut Water'
      },
      'coconut-jelly': {
        productId: 'prod_coconut_jelly',
        priceId: 'price_coconut_jelly',
        name: 'Coconut Jelly'
      }
    }
  };
});

// Import the service after mocking
const stripeService = require('../../../services/stripe');

describe('Stripe Service - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variable for Stripe
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  });

  describe('createOrRetrieveCustomer', () => {
    it('should create new customer when email does not exist', async () => {
      // Mock: No existing customers
      mockStripe.customers.list.mockResolvedValue({ data: [] });

      // Mock: Create customer
      const mockCustomer = {
        id: 'cus_test123',
        email: 'test@example.com',
        metadata: {},
      };
      mockStripe.customers.create.mockResolvedValue(mockCustomer);

      const result = await stripeService.createOrRetrieveCustomer('test@example.com');

      expect(result.id).toBe('cus_test123');
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email: 'test@example.com',
        limit: 1,
      });
      expect(mockStripe.customers.create).toHaveBeenCalled();
    });

    it('should retrieve existing customer when email exists', async () => {
      const existingCustomer = {
        id: 'cus_existing123',
        email: 'existing@example.com',
      };

      mockStripe.customers.list.mockResolvedValue({ data: [existingCustomer] });

      const result = await stripeService.createOrRetrieveCustomer('existing@example.com');

      expect(result.id).toBe('cus_existing123');
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should attach payment method to customer if provided', async () => {
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com',
      });

      await stripeService.createOrRetrieveCustomer('test@example.com', 'pm_test123');

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'pm_test123',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockStripe.customers.list.mockRejectedValue(new Error('Stripe API error'));

      await expect(
        stripeService.createOrRetrieveCustomer('test@example.com')
      ).rejects.toThrow('Failed to create/retrieve customer');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription with valid plan', async () => {
      // Mock price retrieval - make it return data when called with product filter
      mockStripe.prices.list.mockImplementation((params) => {
        if (params.product === 'prod_TlkNETGd6OFrRf') {
          return Promise.resolve({ data: [{ id: 'price_test123' }] });
        }
        return Promise.resolve({ data: [] });
      });

      // Mock customer retrieval
      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_test123',
        invoice_settings: { default_payment_method: 'pm_test123' },
      });

      // Mock subscription creation
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
      };
      mockStripe.subscriptions.create.mockResolvedValue(mockSubscription);

      const result = await stripeService.createSubscription('cus_test123', '1-month');

      expect(result.id).toBe('sub_test123');
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          default_payment_method: 'pm_test123',
        })
      );
    });

    it('should throw error for invalid plan', async () => {
      await expect(
        stripeService.createSubscription('cus_test123', 'invalid-plan')
      ).rejects.toThrow('Invalid plan');
    });

    it('should throw error when no active price found', async () => {
      mockStripe.prices.list.mockResolvedValue({ data: [] });

      await expect(
        stripeService.createSubscription('cus_test123', '1-month')
      ).rejects.toThrow('No active recurring price found');
    });
  });

  describe('getCustomerSubscriptions', () => {
    it('should retrieve all subscriptions for customer', async () => {
      const mockSubscriptions = [
        { id: 'sub_1', status: 'active' },
        { id: 'sub_2', status: 'canceled' },
      ];
      mockStripe.subscriptions.list.mockResolvedValue({ data: mockSubscriptions });

      const result = await stripeService.getCustomerSubscriptions('cus_test123');

      expect(result).toHaveLength(2);
      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          status: undefined, // 'all' should pass undefined
        })
      );
    });

    it('should filter subscriptions by status', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      await stripeService.getCustomerSubscriptions('cus_test123', 'active');

      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription immediately when atPeriodEnd is false', async () => {
      const mockCanceledSubscription = {
        id: 'sub_test123',
        status: 'canceled',
      };
      mockStripe.subscriptions.cancel.mockResolvedValue(mockCanceledSubscription);

      const result = await stripeService.cancelSubscription('sub_test123', false);

      expect(result.status).toBe('canceled');
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_test123');
    });

    it('should schedule cancellation at period end when atPeriodEnd is true', async () => {
      const mockUpdatedSubscription = {
        id: 'sub_test123',
        cancel_at_period_end: true,
      };
      mockStripe.subscriptions.update.mockResolvedValue(mockUpdatedSubscription);

      const result = await stripeService.cancelSubscription('sub_test123', true);

      expect(result.cancel_at_period_end).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_test123',
        { cancel_at_period_end: true }
      );
    });

    it('should handle already canceled subscription error', async () => {
      const error = new Error('No such subscription');
      error.code = 'resource_missing';
      mockStripe.subscriptions.cancel.mockRejectedValue(error);

      await expect(
        stripeService.cancelSubscription('sub_invalid', false)
      ).rejects.toThrow('Subscription is already canceled or does not exist');
    });

    it('should handle other subscription errors', async () => {
      const error = new Error('Some other error');
      mockStripe.subscriptions.cancel.mockRejectedValue(error);

      await expect(
        stripeService.cancelSubscription('sub_invalid', false)
      ).rejects.toThrow('Failed to cancel subscription');
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session with valid parameters', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_test123' }],
      });

      const mockSession = {
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      };
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const result = await stripeService.createCheckoutSession(
        'cus_test123',
        '1-month',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result.id).toBe('cs_test123');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          mode: 'subscription',
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        })
      );
    });
  });

  describe('createProductCheckoutSession', () => {
    it('should create product checkout session successfully', async () => {
      // Mock User model
      const User = require('../../../models/User');
      User.findOne = jest.fn().mockResolvedValue({
        _id: 'user_test123',
        email: 'test@example.com',
      });

      const mockSession = {
        id: 'cs_product_test123',
        url: 'https://checkout.stripe.com/pay/cs_product_test123',
      };
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const items = [
        { productKey: 'seamoss-small', quantity: 2 },
      ];

      const result = await stripeService.createProductCheckoutSession(
        'cus_test123',
        items,
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result.id).toBe('cs_product_test123');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment', // One-time payment
          metadata: expect.objectContaining({
            type: 'product_purchase',
          }),
        })
      );
    });

    it('should throw error for empty items array', async () => {
      await expect(
        stripeService.createProductCheckoutSession(
          'cus_test123',
          [],
          'https://example.com/success',
          'https://example.com/cancel'
        )
      ).rejects.toThrow('No items provided for checkout');
    });

    it('should validate product keys', async () => {
      const items = [{ productKey: 'invalid-product', quantity: 1 }];

      await expect(
        stripeService.createProductCheckoutSession(
          'cus_test123',
          items,
          'https://example.com/success',
          'https://example.com/cancel'
        )
      ).rejects.toThrow('Invalid product key');
    });
  });

  describe('getPlanPricing', () => {
    it('should retrieve pricing for all plans', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_test', unit_amount: 999 }],
      });
      mockStripe.prices.retrieve.mockResolvedValue({
        id: 'price_test',
        unit_amount: 999,
      });

      const pricing = await stripeService.getPlanPricing();

      expect(pricing['1-month']).toBeDefined();
      expect(pricing['1-month'].displayPrice).toBe('$9.99');
    });

    it('should use fallback pricing when Stripe fails', async () => {
      mockStripe.prices.list.mockRejectedValue(new Error('Stripe error'));

      const pricing = await stripeService.getPlanPricing();

      expect(pricing['1-month'].displayPrice).toBe('$9.99'); // Fallback value
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockStripe.customers.create.mockRejectedValue(new Error('Network error'));

      await expect(
        stripeService.createOrRetrieveCustomer('test@example.com')
      ).rejects.toThrow('Failed to create/retrieve customer');
    });

    it('should handle Stripe API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.code = 'rate_limit';
      mockStripe.subscriptions.create.mockRejectedValue(rateLimitError);

      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_test' }],
      });
      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_test',
        invoice_settings: {},
      });

      await expect(
        stripeService.createSubscription('cus_test', '1-month')
      ).rejects.toThrow('Failed to create subscription');
    });
  });
});