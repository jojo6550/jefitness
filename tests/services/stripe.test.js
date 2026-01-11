/**
 * Stripe Service Unit Tests
 * Tests all Stripe service functions with mocked Stripe SDK
 */

// ============================================
// STRIPE MOCK SETUP (MUST BE FIRST)
// ============================================

const mockStripe = {
  customers: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    retrieve: jest.fn()
  },
  prices: {
    list: jest.fn(),
    retrieve: jest.fn()
  },
  products: {
    retrieve: jest.fn()
  },
  subscriptions: {
    create: jest.fn(),
    list: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    del: jest.fn()
  },
  invoices: {
    list: jest.fn()
  },
  checkout: {
    sessions: {
      create: jest.fn()
    }
  },
  paymentMethods: {
    list: jest.fn(),
    detach: jest.fn()
  },
  paymentIntents: {
    create: jest.fn()
  }
};

// Mock the stripe module
jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});



const stripeService = require('../../src/services/stripe');

describe('Stripe Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Set required environment variables
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
    process.env.STRIPE_PRODUCT_1_MONTH = 'prod_1month';
    process.env.STRIPE_PRODUCT_3_MONTH = 'prod_3month';
    process.env.STRIPE_PRODUCT_6_MONTH = 'prod_6month';
    process.env.STRIPE_PRODUCT_12_MONTH = 'prod_12month';
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  // ============================================
  // GET PRICE ID FOR PRODUCT TESTS
  // ============================================
  describe('getPriceIdForProduct', () => {
    it('should return price ID for valid product', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_123', active: true }]
      });

      const priceId = await stripeService.getPriceIdForProduct('prod_test');

      expect(priceId).toBe('price_123');
      expect(mockStripe.prices.list).toHaveBeenCalledWith({
        product: 'prod_test',
        active: true,
        type: 'recurring',
        limit: 1
      });
    });

    it('should return null if no active prices found', async () => {
      mockStripe.prices.list.mockResolvedValue({ data: [] });

      const priceId = await stripeService.getPriceIdForProduct('prod_test');

      expect(priceId).toBeNull();
    });

    it('should return null on error', async () => {
      mockStripe.prices.list.mockRejectedValue(new Error('Stripe API error'));

      const priceId = await stripeService.getPriceIdForProduct('prod_test');

      expect(priceId).toBeNull();
    });
  });

  // ============================================
  // GET PLAN PRICING TESTS
  // ============================================
  describe('getPlanPricing', () => {
    it('should return pricing for all plans from Stripe', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_123', active: true }]
      });
      mockStripe.prices.retrieve.mockResolvedValue({
        id: 'price_123',
        unit_amount: 999,
        currency: 'usd'
      });

      const pricing = await stripeService.getPlanPricing();

      expect(pricing).toHaveProperty('1-month');
      expect(pricing).toHaveProperty('3-month');
      expect(pricing).toHaveProperty('6-month');
      expect(pricing).toHaveProperty('12-month');
      
      expect(pricing['1-month']).toMatchObject({
        amount: 999,
        displayPrice: '$9.99',
        priceId: 'price_123'
      });
      expect(pricing['1-month'].productId).toBeDefined();
    });

    it('should use fallback pricing when Stripe prices not found', async () => {
      mockStripe.prices.list.mockResolvedValue({ data: [] });

      const pricing = await stripeService.getPlanPricing();

      expect(pricing['1-month']).toMatchObject({
        amount: 999,
        displayPrice: '$9.99',
        duration: '1 Month'
      });
      expect(pricing['3-month']).toMatchObject({
        amount: 2799,
        displayPrice: '$27.99',
        savings: '$2.98'
      });
    });

    it('should use fallback pricing on Stripe error', async () => {
      mockStripe.prices.list.mockRejectedValue(new Error('API Error'));

      const pricing = await stripeService.getPlanPricing();

      expect(pricing['1-month']).toBeDefined();
      expect(pricing['1-month'].amount).toBe(999);
    });
  });

  // ============================================
  // CREATE OR RETRIEVE CUSTOMER TESTS
  // ============================================
  describe('createOrRetrieveCustomer', () => {
    it('should create new customer if not exists', async () => {
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_new123',
        email: 'newuser@test.com'
      });

      const customer = await stripeService.createOrRetrieveCustomer('newuser@test.com');

      expect(customer.id).toBe('cus_new123');
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'newuser@test.com',
        metadata: {}
      });
    });

    it('should retrieve existing customer by email', async () => {
      mockStripe.customers.list.mockResolvedValue({
        data: [{
          id: 'cus_existing123',
          email: 'existing@test.com'
        }]
      });

      const customer = await stripeService.createOrRetrieveCustomer('existing@test.com');

      expect(customer.id).toBe('cus_existing123');
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should create customer with payment method', async () => {
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_new123',
        email: 'test@test.com'
      });

      await stripeService.createOrRetrieveCustomer('test@test.com', 'pm_123');

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@test.com',
        payment_method: 'pm_123',
        invoice_settings: {
          default_payment_method: 'pm_123'
        },
        metadata: {}
      });
    });

    it('should update metadata for existing customer', async () => {
      mockStripe.customers.list.mockResolvedValue({
        data: [{ id: 'cus_existing123', email: 'test@test.com' }]
      });
      mockStripe.customers.update.mockResolvedValue({
        id: 'cus_existing123',
        metadata: { userId: '123' }
      });

      const customer = await stripeService.createOrRetrieveCustomer(
        'test@test.com',
        null,
        { userId: '123' }
      );

      expect(mockStripe.customers.update).toHaveBeenCalledWith(
        'cus_existing123',
        { metadata: { userId: '123' } }
      );
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.customers.list.mockRejectedValue(new Error('Stripe error'));

      await expect(
        stripeService.createOrRetrieveCustomer('test@test.com')
      ).rejects.toThrow('Failed to create/retrieve customer');
    });
  });

  // ============================================
  // CREATE SUBSCRIPTION TESTS
  // ============================================
  describe('createSubscription', () => {
    beforeEach(() => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_123' }]
      });
    });

    it('should create subscription with valid plan', async () => {
      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123'
      });

      const subscription = await stripeService.createSubscription('cus_123', '1-month');

      expect(subscription.id).toBe('sub_123');
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_123' }],
        expand: ['latest_invoice.payment_intent'],
        payment_behavior: 'allow_incomplete'
      });
    });

    it('should throw error for invalid plan', async () => {
      await expect(
        stripeService.createSubscription('cus_123', 'invalid-plan')
      ).rejects.toThrow('Invalid plan: invalid-plan');
    });

    it('should throw error if no price found for plan', async () => {
      mockStripe.prices.list.mockResolvedValue({ data: [] });

      await expect(
        stripeService.createSubscription('cus_123', '1-month')
      ).rejects.toThrow('No active recurring price found for plan');
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.subscriptions.create.mockRejectedValue(new Error('Payment failed'));

      await expect(
        stripeService.createSubscription('cus_123', '1-month')
      ).rejects.toThrow('Failed to create subscription');
    });
  });

  // ============================================
  // GET CUSTOMER SUBSCRIPTIONS TESTS
  // ============================================
  describe('getCustomerSubscriptions', () => {
    it('should retrieve all subscriptions for customer', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          { id: 'sub_1', status: 'active' },
          { id: 'sub_2', status: 'canceled' }
        ]
      });

      const subscriptions = await stripeService.getCustomerSubscriptions('cus_123');

      expect(subscriptions).toHaveLength(2);
      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        status: undefined,
        expand: ['data.latest_invoice', 'data.default_payment_method'],
        limit: 100
      });
    });

    it('should filter subscriptions by status', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_1', status: 'active' }]
      });

      const subscriptions = await stripeService.getCustomerSubscriptions('cus_123', 'active');

      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active'
        })
      );
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.subscriptions.list.mockRejectedValue(new Error('API error'));

      await expect(
        stripeService.getCustomerSubscriptions('cus_123')
      ).rejects.toThrow('Failed to retrieve subscriptions');
    });
  });

  // ============================================
  // GET SUBSCRIPTION TESTS
  // ============================================
  describe('getSubscription', () => {
    it('should retrieve subscription by ID', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123'
      });

      const subscription = await stripeService.getSubscription('sub_123');

      expect(subscription.id).toBe('sub_123');
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_123',
        { expand: ['latest_invoice.payment_intent', 'default_payment_method'] }
      );
    });

    it('should throw error if subscription not found', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValue(
        new Error('No such subscription')
      );

      await expect(
        stripeService.getSubscription('sub_invalid')
      ).rejects.toThrow('Failed to retrieve subscription');
    });
  });

  // ============================================
  // UPDATE SUBSCRIPTION TESTS
  // ============================================
  describe('updateSubscription', () => {
    beforeEach(() => {
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ id: 'si_123', price: { id: 'price_old' } }] }
      });
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_new123' }]
      });
    });

    it('should update subscription plan', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ price: { id: 'price_new123' } }] }
      });

      const updated = await stripeService.updateSubscription('sub_123', {
        plan: '3-month'
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          items: [{ id: 'si_123', price: 'price_new123' }],
          proration_behavior: 'create_prorations'
        })
      );
    });

    it('should update payment method', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        default_payment_method: 'pm_new'
      });

      await stripeService.updateSubscription('sub_123', {
        paymentMethodId: 'pm_new'
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          default_payment_method: 'pm_new'
        })
      );
    });

    it('should update metadata', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        metadata: { userId: 'user_123' }
      });

      await stripeService.updateSubscription('sub_123', {
        metadata: { userId: 'user_123' }
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          metadata: { userId: 'user_123' }
        })
      );
    });

    it('should return unchanged subscription if no updates', async () => {
      const subscription = await stripeService.updateSubscription('sub_123', {});

      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
      expect(subscription.id).toBe('sub_123');
    });

    it('should throw error for invalid plan', async () => {
      await expect(
        stripeService.updateSubscription('sub_123', { plan: 'invalid' })
      ).rejects.toThrow('Invalid plan: invalid');
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.subscriptions.update.mockRejectedValue(new Error('Update failed'));

      await expect(
        stripeService.updateSubscription('sub_123', { paymentMethodId: 'pm_new' })
      ).rejects.toThrow('Failed to update subscription');
    });
  });

  // ============================================
  // CANCEL SUBSCRIPTION TESTS
  // ============================================
  describe('cancelSubscription', () => {
    it('should cancel subscription immediately', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });
      mockStripe.subscriptions.del.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled'
      });

      const canceled = await stripeService.cancelSubscription('sub_123', false);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {});
      expect(mockStripe.subscriptions.del).toHaveBeenCalledWith('sub_123');
      expect(canceled.status).toBe('canceled');
    });

    it('should schedule cancellation at period end', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        cancel_at_period_end: true
      });

      const canceled = await stripeService.cancelSubscription('sub_123', true);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        { cancel_at_period_end: true }
      );
      expect(mockStripe.subscriptions.del).not.toHaveBeenCalled();
      expect(canceled.cancel_at_period_end).toBe(true);
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.subscriptions.del.mockRejectedValue(new Error('Cancel failed'));

      await expect(
        stripeService.cancelSubscription('sub_123')
      ).rejects.toThrow('Failed to cancel subscription');
    });
  });

  // ============================================
  // RESUME SUBSCRIPTION TESTS
  // ============================================
  describe('resumeSubscription', () => {
    it('should resume scheduled cancellation', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        cancel_at_period_end: false,
        status: 'active'
      });

      const resumed = await stripeService.resumeSubscription('sub_123');

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        { cancel_at_period_end: false }
      );
      expect(resumed.cancel_at_period_end).toBe(false);
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.subscriptions.update.mockRejectedValue(new Error('Resume failed'));

      await expect(
        stripeService.resumeSubscription('sub_123')
      ).rejects.toThrow('Failed to resume subscription');
    });
  });

  // ============================================
  // GET SUBSCRIPTION INVOICES TESTS
  // ============================================
  describe('getSubscriptionInvoices', () => {
    it('should retrieve all invoices for subscription', async () => {
      mockStripe.invoices.list.mockResolvedValue({
        data: [
          { id: 'in_1', amount_paid: 999 },
          { id: 'in_2', amount_paid: 999 }
        ]
      });

      const invoices = await stripeService.getSubscriptionInvoices('sub_123');

      expect(invoices).toHaveLength(2);
      expect(mockStripe.invoices.list).toHaveBeenCalledWith({
        subscription: 'sub_123',
        limit: 100,
        expand: ['data.payment_intent']
      });
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.invoices.list.mockRejectedValue(new Error('API error'));

      await expect(
        stripeService.getSubscriptionInvoices('sub_123')
      ).rejects.toThrow('Failed to retrieve invoices');
    });
  });

  // ============================================
  // CREATE CHECKOUT SESSION TESTS
  // ============================================
  describe('createCheckoutSession', () => {
    beforeEach(() => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_123' }]
      });
    });

    it('should create checkout session for subscription', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123'
      });

      const session = await stripeService.createCheckoutSession(
        'cus_123',
        '1-month',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(session.id).toBe('cs_123');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: 'price_123', quantity: 1 }],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        billing_address_collection: 'required',
        subscription_data: {
          proration_behavior: 'create_prorations'
        }
      });
    });

    it('should throw error for invalid plan', async () => {
      await expect(
        stripeService.createCheckoutSession('cus_123', 'invalid', 'url', 'url')
      ).rejects.toThrow('Invalid plan: invalid');
    });

    it('should throw error if no price found', async () => {
      mockStripe.prices.list.mockResolvedValue({ data: [] });

      await expect(
        stripeService.createCheckoutSession('cus_123', '1-month', 'url', 'url')
      ).rejects.toThrow('No active recurring price found');
    });
  });

  // ============================================
  // GET PAYMENT METHODS TESTS
  // ============================================
  describe('getPaymentMethods', () => {
    it('should retrieve payment methods for customer', async () => {
      mockStripe.paymentMethods.list.mockResolvedValue({
        data: [
          { id: 'pm_1', card: { brand: 'visa', last4: '4242' } },
          { id: 'pm_2', card: { brand: 'mastercard', last4: '5555' } }
        ]
      });

      const methods = await stripeService.getPaymentMethods('cus_123');

      expect(methods).toHaveLength(2);
      expect(mockStripe.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        type: 'card',
        limit: 100
      });
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.paymentMethods.list.mockRejectedValue(new Error('API error'));

      await expect(
        stripeService.getPaymentMethods('cus_123')
      ).rejects.toThrow('Failed to retrieve payment methods');
    });
  });

  // ============================================
  // DELETE PAYMENT METHOD TESTS
  // ============================================
  describe('deletePaymentMethod', () => {
    it('should detach payment method', async () => {
      mockStripe.paymentMethods.detach.mockResolvedValue({
        id: 'pm_123',
        customer: null
      });

      const deleted = await stripeService.deletePaymentMethod('pm_123');

      expect(deleted.id).toBe('pm_123');
      expect(mockStripe.paymentMethods.detach).toHaveBeenCalledWith('pm_123');
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.paymentMethods.detach.mockRejectedValue(new Error('Detach failed'));

      await expect(
        stripeService.deletePaymentMethod('pm_123')
      ).rejects.toThrow('Failed to delete payment method');
    });
  });

  // ============================================
  // CREATE PAYMENT INTENT TESTS
  // ============================================
  describe('createPaymentIntent', () => {
    it('should create payment intent with default currency', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        amount: 999,
        currency: 'usd',
        status: 'requires_payment_method'
      });

      const intent = await stripeService.createPaymentIntent('cus_123', 999);

      expect(intent.id).toBe('pi_123');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 999,
        currency: 'usd',
        customer: 'cus_123',
        payment_method_types: ['card']
      });
    });

    it('should create payment intent with custom currency', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        amount: 999,
        currency: 'eur'
      });

      await stripeService.createPaymentIntent('cus_123', 999, 'eur');

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'eur' })
      );
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Payment failed'));

      await expect(
        stripeService.createPaymentIntent('cus_123', 999)
      ).rejects.toThrow('Failed to create payment intent');
    });
  });

  // ============================================
  // GET ALL ACTIVE PRICES TESTS
  // ============================================
  describe('getAllActivePrices', () => {
    it('should retrieve and format all active prices', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [
          {
            id: 'price_1',
            product: 'prod_1',
            unit_amount: 999,
            currency: 'usd',
            recurring: { interval: 'month' }
          },
          {
            id: 'price_2',
            product: 'prod_1',
            unit_amount: 8999,
            currency: 'usd',
            recurring: { interval: 'year' }
          }
        ]
      });

      mockStripe.products.retrieve.mockResolvedValue({
        id: 'prod_1',
        name: 'Premium Plan'
      });

      const prices = await stripeService.getAllActivePrices();

      expect(prices).toHaveLength(2);
      expect(prices[0]).toMatchObject({
        priceId: 'price_1',
        productName: 'Premium Plan',
        interval: 'month',
        amount: 9.99,
        currency: 'usd'
      });
      expect(prices[1]).toMatchObject({
        interval: 'year',
        amount: 89.99
      });
    });

    it('should sort prices by interval then amount', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [
          {
            id: 'price_year_high',
            product: 'prod_1',
            unit_amount: 12999,
            currency: 'usd',
            recurring: { interval: 'year' }
          },
          {
            id: 'price_month_low',
            product: 'prod_1',
            unit_amount: 999,
            currency: 'usd',
            recurring: { interval: 'month' }
          },
          {
            id: 'price_month_high',
            product: 'prod_1',
            unit_amount: 1999,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        ]
      });

      mockStripe.products.retrieve.mockResolvedValue({
        id: 'prod_1',
        name: 'Test Product'
      });

      const prices = await stripeService.getAllActivePrices();

      // Monthly should come first, sorted by amount
      expect(prices[0].interval).toBe('month');
      expect(prices[0].amount).toBe(9.99);
      expect(prices[1].interval).toBe('month');
      expect(prices[1].amount).toBe(19.99);
      // Then yearly
      expect(prices[2].interval).toBe('year');
    });

    it('should handle missing product gracefully', async () => {
      mockStripe.prices.list.mockResolvedValue({
        data: [{
          id: 'price_1',
          product: 'prod_missing',
          unit_amount: 999,
          currency: 'usd',
          recurring: { interval: 'month' }
        }]
      });

      mockStripe.products.retrieve.mockResolvedValue({
        id: 'prod_missing',
        name: undefined
      });

      const prices = await stripeService.getAllActivePrices();

      expect(prices[0].productName).toBe('Unknown Product');
    });

    it('should throw error on Stripe failure', async () => {
      mockStripe.prices.list.mockRejectedValue(new Error('API error'));

      await expect(
        stripeService.getAllActivePrices()
      ).rejects.toThrow('Failed to fetch active prices');
    });
  });

  // ============================================
  // MODULE EXPORTS TESTS
  // ============================================
  describe('Module Exports', () => {
    it('should export all required functions', () => {
      expect(typeof stripeService.createOrRetrieveCustomer).toBe('function');
      expect(typeof stripeService.createSubscription).toBe('function');
      expect(typeof stripeService.getCustomerSubscriptions).toBe('function');
      expect(typeof stripeService.getSubscription).toBe('function');
      expect(typeof stripeService.updateSubscription).toBe('function');
      expect(typeof stripeService.cancelSubscription).toBe('function');
      expect(typeof stripeService.resumeSubscription).toBe('function');
      expect(typeof stripeService.getSubscriptionInvoices).toBe('function');
      expect(typeof stripeService.createCheckoutSession).toBe('function');
      expect(typeof stripeService.getPaymentMethods).toBe('function');
      expect(typeof stripeService.deletePaymentMethod).toBe('function');
      expect(typeof stripeService.createPaymentIntent).toBe('function');
      expect(typeof stripeService.getPriceIdForProduct).toBe('function');
      expect(typeof stripeService.getPlanPricing).toBe('function');
      expect(typeof stripeService.getAllActivePrices).toBe('function');
    });

    it('should export product IDs configuration', () => {
      expect(stripeService.PRODUCT_IDS).toBeDefined();
      expect(stripeService.PRODUCT_IDS['1-month']).toBeDefined();
      expect(stripeService.PRODUCT_IDS['3-month']).toBeDefined();
      expect(stripeService.PRODUCT_IDS['6-month']).toBeDefined();
      expect(stripeService.PRODUCT_IDS['12-month']).toBeDefined();
      // Verify they use environment variables or fallback values
      expect(typeof stripeService.PRODUCT_IDS['1-month']).toBe('string');
    });


  });
});