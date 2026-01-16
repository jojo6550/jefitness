/**
 * Unit Tests for Subscription Expiry Service
 * Tests all functions in src/services/subscriptionExpiry.js
 * Mocks database interactions and logger
 */

const subscriptionExpiry = require('../../../services/subscriptionExpiry');

// Mock User model
jest.mock('../../../models/User', () => ({
  find: jest.fn(),
}));

// Mock logger
jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const User = require('../../../models/User');
const { logger } = require('../../../services/logger');

describe('Subscription Expiry Service - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkExpiredSubscriptions', () => {
    it('should update expired subscriptions to expired status', async () => {
      const mockExpiredUser = {
        _id: 'user1',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date('2023-01-01'),
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockExpiredUser]);

      const result = await subscriptionExpiry.checkExpiredSubscriptions();

      expect(result).toBe(1);
      expect(mockExpiredUser.subscriptionStatus).toBe('expired');
      expect(mockExpiredUser.save).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Subscription expired for user user1',
        expect.objectContaining({
          userId: 'user1',
          previousStatus: 'active',
          newStatus: 'expired',
        })
      );
    });

    it('should cancel subscriptions set to cancel at period end', async () => {
      const mockUser = {
        _id: 'user2',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date('2023-01-01'),
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: 'sub_123',
        subscriptionType: '1-month',
        stripePriceId: 'price_123',
        currentPeriodStart: new Date('2022-12-01'),
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockUser]);

      await subscriptionExpiry.checkExpiredSubscriptions();

      expect(mockUser.subscriptionStatus).toBe('cancelled');
      expect(mockUser.stripeSubscriptionId).toBeNull();
      expect(mockUser.subscriptionType).toBeNull();
      expect(mockUser.stripePriceId).toBeNull();
      expect(mockUser.currentPeriodStart).toBeNull();
      expect(mockUser.currentPeriodEnd).toBeNull();
      expect(mockUser.cancelAtPeriodEnd).toBe(false);
    });

    it('should return 0 when no expired subscriptions found', async () => {
      User.find.mockResolvedValue([]);

      const result = await subscriptionExpiry.checkExpiredSubscriptions();

      expect(result).toBe(0);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      User.find.mockRejectedValue(new Error('Database connection failed'));

      await expect(subscriptionExpiry.checkExpiredSubscriptions()).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith('Error in checkExpiredSubscriptions', {
        error: 'Database connection failed',
      });
    });
  });

  describe('checkPastDueSubscriptions', () => {
    it('should cancel past due subscriptions older than 30 days', async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const mockPastDueUser = {
        _id: 'user3',
        subscriptionStatus: 'past_due',
        updatedAt: thirtyOneDaysAgo,
        stripeSubscriptionId: 'sub_456',
        subscriptionType: '1-month',
        stripePriceId: 'price_456',
        currentPeriodStart: new Date('2023-01-01'),
        currentPeriodEnd: new Date('2023-02-01'),
        cancelAtPeriodEnd: false,
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockPastDueUser]);

      const result = await subscriptionExpiry.checkPastDueSubscriptions();

      expect(result).toBe(1);
      expect(mockPastDueUser.subscriptionStatus).toBe('cancelled');
      expect(mockPastDueUser.stripeSubscriptionId).toBeNull();
      expect(mockPastDueUser.subscriptionType).toBeNull();
      expect(mockPastDueUser.stripePriceId).toBeNull();
      expect(mockPastDueUser.currentPeriodStart).toBeNull();
      expect(mockPastDueUser.currentPeriodEnd).toBeNull();
      expect(mockPastDueUser.cancelAtPeriodEnd).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        'Past due subscription cancelled for user user3',
        expect.objectContaining({
          userId: 'user3',
          previousStatus: 'past_due',
          newStatus: 'cancelled',
        })
      );
    });

    it('should not cancel recent past due subscriptions', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const mockRecentUser = {
        _id: 'user4',
        subscriptionStatus: 'past_due',
        updatedAt: fiveDaysAgo,
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockRecentUser]);

      const result = await subscriptionExpiry.checkPastDueSubscriptions();

      expect(result).toBe(0);
      expect(mockRecentUser.save).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should return 0 when no past due subscriptions found', async () => {
      User.find.mockResolvedValue([]);

      const result = await subscriptionExpiry.checkPastDueSubscriptions();

      expect(result).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      User.find.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionExpiry.checkPastDueSubscriptions()).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error in checkPastDueSubscriptions', {
        error: 'Database error',
      });
    });
  });

  describe('runSubscriptionMaintenance', () => {
    it('should run both expiry and past due checks successfully', async () => {
      // Mock expired subscriptions
      const mockExpiredUser = {
        _id: 'user5',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date('2023-01-01'),
        save: jest.fn(),
      };

      // Mock past due subscriptions
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const mockPastDueUser = {
        _id: 'user6',
        subscriptionStatus: 'past_due',
        updatedAt: thirtyOneDaysAgo,
        save: jest.fn(),
      };

      User.find
        .mockResolvedValueOnce([mockExpiredUser]) // For expired check
        .mockResolvedValueOnce([mockPastDueUser]); // For past due check

      const result = await subscriptionExpiry.runSubscriptionMaintenance();

      expect(result).toEqual({
        expiredCount: 1,
        pastDueCount: 1,
        totalUpdated: 2,
      });
      expect(mockExpiredUser.save).toHaveBeenCalled();
      expect(mockPastDueUser.save).toHaveBeenCalled();
    });

    it('should handle when no updates are needed', async () => {
      User.find.mockResolvedValue([]);

      const result = await subscriptionExpiry.runSubscriptionMaintenance();

      expect(result).toEqual({
        expiredCount: 0,
        pastDueCount: 0,
        totalUpdated: 0,
      });
    });

    it('should handle errors in individual checks', async () => {
      User.find
        .mockRejectedValueOnce(new Error('Expired check failed'))
        .mockResolvedValueOnce([]);

      await expect(subscriptionExpiry.runSubscriptionMaintenance()).rejects.toThrow('Expired check failed');
      expect(logger.error).toHaveBeenCalledWith('Error in runSubscriptionMaintenance', {
        error: 'Expired check failed',
      });
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle users with missing currentPeriodEnd', async () => {
      const mockUser = {
        _id: 'user7',
        subscriptionStatus: 'active',
        currentPeriodEnd: null,
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockUser]);

      const result = await subscriptionExpiry.checkExpiredSubscriptions();

      // Should not update users without currentPeriodEnd
      expect(result).toBe(0);
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should handle users with future currentPeriodEnd', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const mockUser = {
        _id: 'user8',
        subscriptionStatus: 'active',
        currentPeriodEnd: futureDate,
        save: jest.fn(),
      };

      User.find.mockResolvedValue([mockUser]);

      const result = await subscriptionExpiry.checkExpiredSubscriptions();

      expect(result).toBe(0);
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should handle save operation failures', async () => {
      const mockUser = {
        _id: 'user9',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date('2023-01-01'),
        save: jest.fn().mockRejectedValue(new Error('Save failed')),
      };

      User.find.mockResolvedValue([mockUser]);

      await expect(subscriptionExpiry.checkExpiredSubscriptions()).rejects.toThrow('Save failed');
    });
  });
});
