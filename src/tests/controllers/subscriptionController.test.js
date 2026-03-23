const subscriptionController = require('../../controllers/subscriptionController');
const stripeService = require('../../services/stripe');
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');

jest.mock('../../services/stripe');
jest.mock('../../models/Subscription');
jest.mock('../../models/User');

describe('subscriptionController', () => {
  const mockReq = {
    user: { id: 'user123' },
    params: {},
    body: {},
    protocol: 'http',
    get: jest.fn().mockReturnValue('localhost:3000')
  };
  const mockRes = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis()
  };
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPlans', () => {
    it('should return plans from service', async () => {
      stripeService.getPlanPricing.mockResolvedValue({ '1-month': { amount: 999 } });

      await subscriptionController.getPlans(mockReq, mockRes);

      expect(stripeService.getPlanPricing).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: { plans: expect.any(Object) } });
    });
  });

  describe('verifyCheckoutSession - proactive upsert', () => {
    it('should use getPlanNameFromPriceId for plan name', async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        id: 'sess_mock',
        payment_status: 'paid',
        mode: 'subscription',
        subscription: 'sub_mock',
        customer: 'cus_mock'
      });
      stripeService.getStripe.mockReturnValue({ subscriptions: { retrieve: jest.fn() } });
      User.findOne.mockResolvedValue({ _id: 'user123', email: 'test@example.com' });
      stripeService.getStripe().subscriptions.retrieve.mockResolvedValue({
        id: 'sub_mock',
        customer: { id: 'cus_mock' },
        items: { data: [{ price: { id: 'price_mock' } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        status: 'active'
      });
      stripeService.getPlanNameFromPriceId.mockResolvedValue('1-month');

      Subscription.findOne.mockResolvedValue(null);
      Subscription.findOneAndUpdate.mockResolvedValue({ toObject: () => ({}) });

      mockReq.params.sessionId = 'sess_mock';

      await subscriptionController.verifyCheckoutSession(mockReq, mockRes);

      expect(stripeService.getPlanNameFromPriceId).toHaveBeenCalledWith('price_mock');
    });
  });
});

