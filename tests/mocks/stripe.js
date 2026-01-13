// Mock Stripe module
const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({
        id: 'cs_test_mock_session',
        url: 'https://checkout.stripe.com/pay/cs_test_mock_session'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cs_test_mock_session',
        payment_intent: 'pi_mock',
        customer: 'cus_mock_customer'
      })
    }
  },
  webhooks: {
    constructEvent: jest.fn((body, signature, secret) => {
      // Mock webhook signature verification
      if (signature === 'mock_signature') {
        return {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_mock_session',
              customer: 'cus_mock_customer',
              subscription: 'sub_mock_subscription',
              metadata: {
                userId: 'test_user_id'
              }
            }
          }
        };
      }
      throw new Error('Invalid signature');
    })
  },
  customers: {
    create: jest.fn().mockResolvedValue({
      id: 'cus_mock_customer',
      email: 'test@example.com'
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_mock_customer',
      email: 'test@example.com',
      invoice_settings: { default_payment_method: null }
    }),
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'cus_mock_customer',
        email: 'test@example.com'
      }]
    }),
    update: jest.fn().mockResolvedValue({
      id: 'cus_mock_customer',
      email: 'test@example.com'
    })
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'active',
      current_period_start: Date.now() / 1000,
      current_period_end: (Date.now() / 1000) + (30 * 24 * 60 * 60),
      items: {
        data: [{
          price: { id: 'price_mock' }
        }]
      }
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'active',
      items: {
        data: [{
          id: 'si_mock_item',
          price: { id: 'price_mock' }
        }]
      },
      latest_invoice: { payment_intent: 'pi_mock' },
      default_payment_method: null
    }),
    update: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'canceled',
      cancel_at_period_end: false
    }),
    cancel: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'canceled'
    }),
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'sub_mock_subscription',
        status: 'active'
      }]
    }),
    del: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'canceled'
    })
  },
  prices: {
    retrieve: jest.fn().mockResolvedValue({
      id: 'price_mock',
      unit_amount: 2999,
      currency: 'usd',
      recurring: { interval: 'month' }
    }),
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'price_mock',
        unit_amount: 2999,
        currency: 'usd',
        recurring: { interval: 'month' },
        product: 'prod_mock'
      }]
    })
  },
  products: {
    retrieve: jest.fn().mockResolvedValue({
      id: 'prod_mock',
      name: 'Mock Product',
      active: true,
      default_price: 'price_mock'
    }),
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'prod_mock',
        name: 'Mock Product',
        active: true,
        default_price: 'price_mock'
      }]
    })
  },
  paymentMethods: {
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'pm_mock',
        type: 'card'
      }]
    }),
    attach: jest.fn().mockResolvedValue({
      id: 'pm_mock'
    }),
    detach: jest.fn().mockResolvedValue({
      id: 'pm_mock'
    })
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_mock',
      status: 'succeeded'
    })
  },
  invoices: {
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'inv_mock',
        status: 'paid'
      }]
    })
  }
};

module.exports = jest.fn(() => mockStripe);
