import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as stripeService from '../../../../services/stripe.js';

// Mock Stripe SDK
const mockStripe = {
  customers: {
    create: jest.fn(),
    list: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn()
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn()
  },
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn()
    }
  },
  prices: {
    list: jest.fn(),
    retrieve: jest.fn()
  },
  invoices: {
    list: jest.fn()
  },
  paymentMethods: {
    list: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn()
  },
  paymentIntents: {
    create: jest.fn()
  },
  products: {
    list: jest.fn(),
    retrieve: jest.fn()
  }
};

jest.mock('stripe', () => jest.fn(() => mockStripe));

const { PRODUCT_IDS } = stripeService;

describe('stripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset cache
    stripeService.priceCache = {};
    stripeService.cacheExpiry = 0;
  });

  describe('getPlanPricing', () => {
    it('should return cached plans within TTL', async () => {
      // First call populates cache
      mockStripe.prices.list.mockResolvedValue({ data: [{ id: 'price_mock', unit_amount: 999 }] });
      const firstResult = await stripeService.getPlanPricing();
      
      // Second call should hit cache
      const secondResult = await stripeService.getPlanPricing();

      expect(firstResult).toEqual(secondResult);
      expect(mockStripe.prices.list).toHaveBeenCalledTimes(1); // Cached!
    });

    it('should fetch fresh after cache expiry', async () => {
      stripeService.cacheExpiry = Date.now() - 1; // Expired
      mockStripe.prices.list.mockResolvedValue({ data: [{ id: 'price_new' }] });

      await stripeService.getPlanPricing();

      expect(stripeService.priceCache).toEqual(expect.any(Object));
      expect(stripeService.cacheExpiry).toBeGreaterThan(Date.now());
    });

    it('should use fallback pricing on Stripe failure', async () => {
      mockStripe.prices.list.mockRejectedValue(new Error('Network error'));

      const result = await stripeService.getPlanPricing();

      expect(result['1-month']).toEqual(expect.objectContaining({
        amount: 999,
        displayPrice: '$9.99'
      }));
    });

    it('should parallel fetch all product prices', async () => {
      const products = Object.keys(PRODUCT_IDS);
      
      await stripeService.getPlanPricing();

      // Verify parallel calls to getPriceIdForProduct for each product
      expect(mockStripe.prices.list).toHaveBeenCalledTimes(products.length);
    });
  });

  describe('createOrRetrieveCustomer', () => {
    it('should retrieve existing customer by email', async () => {
      mockStripe.customers.list.mockResolvedValue({
        data: [{ id: 'cus_existing', email: 'test@example.com' }]
      });

      const customer = await stripeService.createOrRetrieveCustomer('test@example.com');

      expect(customer.id).toBe('cus_existing');
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email: 'test@example.com',
        limit: 1
      });
    });

    it('should create new customer if none exists', async () => {
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new' });

      await stripeService.createOrRetrieveCustomer('new@example.com');

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com'
      });
    });

    it('should attach payment method to existing customer', async () => {
      mockStripe.customers.list.mockResolvedValue({
        data: [{ id: 'cus_pm' }]
      });
      mockStripe.paymentMethods.attach.mockResolvedValue();

      await stripeService.createOrRetrieveCustomer('test@example.com', 'pm_123');

      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith('pm_123', { customer: 'cus_pm' });
    });
  });

  describe('createCheckoutSession', () => {
    it('should create subscription checkout session', async () => {
      const mockSession = { id: 'sess_123', url: 'https://checkout.stripe.com' };
      mockStripe.prices.list.mockResolvedValue({ data: [{ id: 'price_monthly' }] });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const result = await stripeService.createCheckoutSession('cus_test', '1-month', 'success', 'cancel');

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_test',
        line_items: [{ price: 'price_monthly', quantity: 1 }],
        mode: 'subscription'
      }));
      expect(result.url).toBe(mockSession.url);
    });

    it('should throw for invalid plan', async () => {
      await expect(stripeService.createCheckoutSession('cus_test', 'invalid-plan', 'success', 'cancel'))
        .rejects.toThrow('Invalid plan: invalid-plan');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel immediately', async () => {
      mockStripe.subscriptions.cancel.mockResolvedValue({ status: 'canceled' });

      const result = await stripeService.cancelSubscription('sub_123', false);

      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
      expect(result.status).toBe('canceled');
    });

    it('should cancel at period end', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({ cancel_at_period_end: true });

      await stripeService.cancelSubscription('sub_456', true);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_456', { cancel_at_period_end: true });
    });

    it('should be idempotent for already canceled', async () => {
      mockStripe.subscriptions.cancel.mockRejectedValue({
        message: 'already canceled',
        code: 'resource_missing'
      });

      const result = await stripeService.cancelSubscription('sub_gone');

      expect(result).toBeNull(); // Treated as success
    });
  });

  describe('getSubscriptionInvoices', () => {
    it('should list invoices for subscription', async () => {
      mockStripe.invoices.list.mockResolvedValue({
        data: [{ id: 'inv_001', amount_due: 999 }]
      });

      const invoices = await stripeService.getSubscriptionInvoices('sub_mock');

      expect(mockStripe.invoices.list).toHaveBeenCalledWith({
        subscription: 'sub_mock',
        limit: 100,
        expand: ['data.payment_intent']
      });
      expect(invoices).toHaveLength(1);
    });
  });

  describe('createProductCheckoutSession', () => {
    it('should create session for multiple products', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_products' });

      const items = [
        { productKey: 'tshirt', quantity: 2 },
        { productKey: 'hat', quantity: 1 }
      ];

      await stripeService.createProductCheckoutSession('cus_prod', items, 'success', 'cancel');

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'payment',
        line_items: expect.arrayContaining([
          expect.objectContaining({ quantity: 2 })
        ]),
        metadata: expect.objectContaining({
          type: 'product_purchase',
          itemCount: '2'
        })
      }));
    });
  });

  describe('getAllProducts', () => {
    it('should fetch products with prices', async () => {
      mockStripe.products.list.mockResolvedValue({
        data: [{
          id: 'prod_test',
          name: 'Test Product',
          default_price: { id: 'price_test' }
        }]
      });
      mockStripe.prices.list.mockResolvedValue({ data: [{ id: 'price_test' }] });

      const products = await stripeService.getAllProducts();

      expect(products).toHaveLength(1);
      expect(products[0]).toEqual(expect.objectContaining({
        id: 'prod_test',
        prices: expect.any(Array)
      }));
    });
  });

  // Additional tests for other functions can be added...
  describe('getStripe lazy init', () => {
    it('should lazy init Stripe', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
      const stripe = stripeService.getStripe();

      expect(stripe).toBe(mockStripe);
      expect(stripeService.getStripe()).toBe(mockStripe); // Same instance
    });

    it('should return null without STRIPE_SECRET_KEY', () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect(stripeService.getStripe()).toBeNull();
    });
  });
});

