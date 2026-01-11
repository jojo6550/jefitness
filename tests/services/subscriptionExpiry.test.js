const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const {
  checkExpiredSubscriptions,
  checkPastDueSubscriptions,
  runSubscriptionMaintenance
} = require('../../src/services/subscriptionExpiry');

let mongoServer;

describe('Subscription Expiry Service', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('checkExpiredSubscriptions', () => {
    it('should update expired active subscriptions to expired status', async () => {
      // Create a user with an expired subscription
      const expiredUser = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'hashedpassword456',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        stripeSubscriptionId: 'sub_expired123'
      });
      await expiredUser.save();

      // Create a user with an active subscription
      const activeUser = new User({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        password: 'hashedpassword567',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
        stripeSubscriptionId: 'sub_active123'
      });
      await activeUser.save();

      const updatedCount = await checkExpiredSubscriptions();

      expect(updatedCount).toBe(1);

      // Check that expired user was updated
      const updatedExpiredUser = await User.findById(expiredUser._id);
      expect(updatedExpiredUser.subscriptionStatus).toBe('expired');

      // Check that active user was not updated
      const updatedActiveUser = await User.findById(activeUser._id);
      expect(updatedActiveUser.subscriptionStatus).toBe('active');
    });

    it('should cancel subscriptions set to cancel at period end', async () => {
      const cancelUser = new User({
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob@example.com',
        password: 'hashedpassword123',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: 'sub_cancel123',
        subscriptionType: '1-month'
      });
      await cancelUser.save();

      const updatedCount = await checkExpiredSubscriptions();

      expect(updatedCount).toBe(1);

      const updatedUser = await User.findById(cancelUser._id);
      expect(updatedUser.subscriptionStatus).toBe('cancelled');
      expect(updatedUser.cancelAtPeriodEnd).toBe(false);
      expect(updatedUser.stripeSubscriptionId).toBeNull();
      expect(updatedUser.subscriptionType).toBeNull();
    });

    it('should return 0 when no subscriptions are expired', async () => {
      // Create a user with future expiry
      const futureUser = new User({
        firstName: 'Alice',
        lastName: 'Brown',
        email: 'alice@example.com',
        password: 'hashedpassword789',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        stripeSubscriptionId: 'sub_future123'
      });
      await futureUser.save();

      const updatedCount = await checkExpiredSubscriptions();

      expect(updatedCount).toBe(0);
    });
  });

  describe('checkPastDueSubscriptions', () => {
    it('should cancel past due subscriptions after 30 days', async () => {
      // Create a past due user updated more than 30 days ago
      const pastDueUser = new User({
        firstName: 'Charlie',
        lastName: 'Davis',
        email: 'charlie@example.com',
        password: 'hashedpassword678',
        subscriptionStatus: 'past_due',
        stripeSubscriptionId: 'sub_pastdue123',
        updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });
      await pastDueUser.save();

      // Create a recently past due user
      const recentPastDueUser = new User({
        firstName: 'Diana',
        lastName: 'Evans',
        email: 'diana@example.com',
        password: 'hashedpassword789',
        subscriptionStatus: 'past_due',
        stripeSubscriptionId: 'sub_recent123'
      });
      await recentPastDueUser.save();
      // Manually set updatedAt to 15 days ago using findByIdAndUpdate
      await User.findByIdAndUpdate(recentPastDueUser._id, { updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) });

      const cancelledCount = await checkPastDueSubscriptions();

      expect(cancelledCount).toBe(1);

      // Check that old past due user was cancelled
      const updatedPastDueUser = await User.findById(pastDueUser._id);
      expect(updatedPastDueUser.subscriptionStatus).toBe('cancelled');
      expect(updatedPastDueUser.stripeSubscriptionId).toBeNull();

      // Check that recent past due user was not cancelled
      const updatedRecentUser = await User.findById(recentPastDueUser._id);
      expect(updatedRecentUser.subscriptionStatus).toBe('past_due');
    });

    it('should return 0 when no past due subscriptions need cancellation', async () => {
      // Create a recently past due user
      const recentPastDueUser = new User({
        firstName: 'Eve',
        lastName: 'Foster',
        email: 'eve@example.com',
        password: 'hashedpassword890',
        subscriptionStatus: 'past_due',
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        stripeSubscriptionId: 'sub_recent123'
      });
      await recentPastDueUser.save();

      const cancelledCount = await checkPastDueSubscriptions();

      expect(cancelledCount).toBe(0);
    });
  });

  describe('runSubscriptionMaintenance', () => {
    it('should run both expiry and past due checks and return results', async () => {
      // Create expired subscription
      const expiredUser = new User({
        firstName: 'Frank',
        lastName: 'Garcia',
        email: 'frank@example.com',
        password: 'hashedpassword101',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        stripeSubscriptionId: 'sub_expired123'
      });
      await expiredUser.save();

      // Create past due subscription
      const pastDueUser = new User({
        firstName: 'Grace',
        lastName: 'Hill',
        email: 'grace@example.com',
        password: 'hashedpassword102',
        subscriptionStatus: 'past_due',
        stripeSubscriptionId: 'sub_pastdue123'
      });
      await pastDueUser.save();
      // Manually set updatedAt to 31 days ago using findByIdAndUpdate
      await User.findByIdAndUpdate(pastDueUser._id, { updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });

      const result = await runSubscriptionMaintenance();

      expect(result.expiredCount).toBe(1);
      expect(result.pastDueCount).toBe(1);
      expect(result.totalUpdated).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      // Mock mongoose error
      const originalFind = User.find;
      User.find = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(runSubscriptionMaintenance()).rejects.toThrow('Database error');

      // Restore original method
      User.find = originalFind;
    });
  });
});
