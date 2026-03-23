const stripeService = require('../../services/stripe');
const StripePlan = require('../../models/StripePlan');
const { PRODUCT_IDS } = require('../../config/stripeConfig');

jest.mock('../../models/StripePlan');

describe('stripeService - DB Price Fetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  });

  describe('getPlanPricing', () => {
    it('should fetch pricing from DB successfully', async () => {
      const mockPlans = [
        {
          stripeProductId: PRODUCT_IDS['1-month'],
          unitAmount: 99900,
          currency: 'usd',
          stripePriceId: 'price_1month',
          active: true,
          type: 'recurring'
        }
      ];
      StripePlan.find.mockResolvedValue(mockPlans);

      const result = await stripeService.getPlanPricing();

      expect(StripePlan.find).toHaveBeenCalledWith({ active: true, type: 'recurring' });
      expect(result['1-month']).toMatchObject({
        amount: 99900,
        currency: 'usd',
        priceId: 'price_1month'
      });
    });

    it('should use fallback if no DB record', async () => {
      StripePlan.find.mockResolvedValue([]);

      const result = await stripeService.getPlanPricing();

      expect(result['1-month'].amount).toBe(999);
    });

    it('should cache results', async () => {
      StripePlan.find.mockResolvedValueOnce([ /* mock */ ]);
      const first = await stripeService.getPlanPricing();
      
      // Cache hit
      const second = await stripeService.getPlanPricing();
      
      expect(first).toBe(second);
      expect(StripePlan.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPriceIdForPlan', () => {
    it('should return priceId from DB', async () => {
      StripePlan.findOne.mockResolvedValue({
        stripePriceId: 'price_mock',
        active: true,
        type: 'recurring'
      });

      const result = await stripeService.getPriceIdForPlan('1-month');

      expect(result).toBe('price_mock');
    });

    it('should return null if no matching plan', async () => {
      StripePlan.findOne.mockResolvedValue(null);

      const result = await stripeService.getPriceIdForPlan('1-month');

      expect(result).toBeNull();
    });
  });

  describe('getPlanNameFromPriceId', () => {
    it('should return plan name from DB', async () => {
      StripePlan.findOne.mockResolvedValue({
        nickname: 'Pro Monthly',
        lookupKey: 'pro-monthly',
        intervalCount: 1,
        interval: 'month'
      });

      const result = await stripeService.getPlanNameFromPriceId('price_mock');

      expect(result).toBe('Pro Monthly');
    });

    it('should fallback to computed name', async () => {
      StripePlan.findOne.mockResolvedValue({
        intervalCount: 3,
        interval: 'month'
      });

      const result = await stripeService.getPlanNameFromPriceId('price_mock');

      expect(result).toBe('3-month');
    });

    it('should return unknown-plan if not found', async () => {
      StripePlan.findOne.mockResolvedValue(null);

      const result = await stripeService.getPlanNameFromPriceId('price_missing');

      expect(result).toBe('unknown-plan');
    });
  });
});

