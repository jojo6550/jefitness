jest.mock('../../services/logger', () => ({
  logSecurityEvent: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../models/Subscription');

const mongoose = require('mongoose');

const { cleanupExpiredSubscriptions } = require('../../jobs');

describe('Cleanup Jobs', () => {
  describe('cleanupExpiredSubscriptions', () => {
    let Subscription;

    beforeEach(() => {
      Subscription = require('../../models/Subscription');
      jest.clearAllMocks();
    });

    it('should cancel expired active subscription', async () => {
      const userId = new mongoose.Types.ObjectId();
      const yesterday = new Date(Date.now() - 86400000);
      const subId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        userId,
        status: 'active',
        currentPeriodEnd: yesterday,
        queuedPlan: null,
        save: jest.fn().mockResolvedValue(true),
      };

      Subscription.find.mockResolvedValue([mockSub]);

      await cleanupExpiredSubscriptions();

      expect(mockSub.status).toBe('cancelled');
      expect(mockSub.canceledAt).toBeDefined();
      expect(mockSub.save).toHaveBeenCalled();
    });

    it('should activate queued plan', async () => {
      const userId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();
      const yesterday = new Date(Date.now() - 86400000);
      const tomorrow = new Date(Date.now() + 86400000);

      const mockSub = {
        _id: subId,
        userId,
        status: 'active',
        plan: '1-month',
        currentPeriodEnd: yesterday,
        queuedPlan: {
          plan: '12-month',
          stripeSubscriptionId: 'sub_queued',
          stripePriceId: 'price_12month',
          currentPeriodEnd: tomorrow,
        },
        save: jest.fn().mockResolvedValue(true),
      };

      Subscription.find.mockResolvedValue([mockSub]);

      await cleanupExpiredSubscriptions();

      expect(mockSub.status).toBe('active');
      expect(mockSub.plan).toBe('12-month');
      expect(mockSub.stripeSubscriptionId).toBe('sub_queued');
      expect(mockSub.stripePriceId).toBe('price_12month');
      expect(mockSub.currentPeriodStart).toEqual(yesterday);
      expect(mockSub.currentPeriodEnd).toEqual(tomorrow);
      expect(mockSub.queuedPlan).toBeNull();
      expect(mockSub.save).toHaveBeenCalled();
    });
  });
});
