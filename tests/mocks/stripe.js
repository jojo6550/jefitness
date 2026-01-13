// Mock Stripe module
const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({
        id: 'cs_test_mock_session',
        url: 'https://checkout.stripe.com/pay/cs_test_mock_session'
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
      email: 'test@example.com'
    })
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'active',
      current_period_start: Date.now() / 1000,
      current_period_end: (Date.now() / 1000) + (30 * 24 * 60 * 60)
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'active'
    }),
    update: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'canceled'
    }),
    cancel: jest.fn().mockResolvedValue({
      id: 'sub_mock_subscription',
      status: 'canceled'
    })
  },
  prices: {
    retrieve: jest.fn().mockResolvedValue({
      id: 'price_mock',
      unit_amount: 2999,
      currency: 'usd'
    })
  }
};

module.exports = jest.fn(() => mockStripe);
