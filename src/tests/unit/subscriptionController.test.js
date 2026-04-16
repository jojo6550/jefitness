const mongoose = require('mongoose');

const Subscription = require('../../models/Subscription');
const User = require('../../models/User');
const stripeService = require('../../services/stripe');

jest.mock('../../models/Subscription');
jest.mock('../../models/User');
jest.mock('../../services/stripe');
jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../middleware/errorHandler', () => {
  const actual = jest.requireActual('../../middleware/errorHandler');
  return {
    ...actual,
    asyncHandler: fn => fn, // Unwrap asyncHandler for testing
  };
});

const {
  getCurrentSubscription,
  createCheckout,
  verifyCheckoutSession,
  cancel,
  refresh,
} = require('../../controllers/subscriptionController');

describe('subscriptionController', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: {
        _id: new mongoose.Types.ObjectId(),
        email: 'test@example.com',
      },
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('getCurrentSubscription', () => {
    it('should return active subscription with daysLeft', async () => {
      const userId = mockReq.user._id;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 10 * 86400000);

      const mockSub = {
        userId,
        status: 'active',
        plan: '1-month',
        currentPeriodEnd: periodEnd,
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId,
          status: 'active',
          plan: '1-month',
          currentPeriodEnd: periodEnd,
        }),
      };

      Subscription.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSub),
      });

      await getCurrentSubscription(mockReq, mockRes, mockNext);

      expect(Subscription.findOne).toHaveBeenCalledWith({
        userId: mockReq.user._id,
        status: { $in: ['active', 'trialing'] },
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'active',
          daysLeft: expect.any(Number),
        }),
      });
    });

    it('should return null if no active subscription', async () => {
      Subscription.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await getCurrentSubscription(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: null });
    });

    it('should ignore cancelled subscription', async () => {
      Subscription.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await getCurrentSubscription(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: null });
    });

    it('should calculate daysLeft correctly for upcoming period end', async () => {
      const userId = mockReq.user._id;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 5 * 86400000); // 5 days from now

      const mockSub = {
        userId,
        status: 'active',
        plan: '1-month',
        currentPeriodEnd: periodEnd,
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId,
          status: 'active',
          plan: '1-month',
          currentPeriodEnd: periodEnd,
        }),
      };

      Subscription.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSub),
      });

      await getCurrentSubscription(mockReq, mockRes, mockNext);

      const callArgs = mockRes.json.mock.calls[0][0];
      expect(callArgs.data.daysLeft).toBeGreaterThan(0);
      expect(callArgs.data.daysLeft).toBeLessThanOrEqual(5);
    });
  });

  describe('createCheckout', () => {
    it('should create checkout session for valid plan', async () => {
      mockReq.body = { plan: '1-month', queued: false };

      const mockCustomer = { id: 'cus_123' };
      const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com' };

      stripeService.createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      Subscription.findOne.mockResolvedValue(null);
      stripeService.createCheckoutSession.mockResolvedValue(mockSession);

      await createCheckout(mockReq, mockRes, mockNext);

      expect(stripeService.createOrRetrieveCustomer).toHaveBeenCalledWith(
        mockReq.user.email
      );
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        mockCustomer.id,
        '1-month',
        null,
        { plan: '1-month' }
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        sessionId: 'cs_123',
        url: 'https://checkout.stripe.com',
      });
    });

    it('should reject invalid plan', async () => {
      mockReq.body = { plan: 'invalid-plan', queued: false };

      await createCheckout(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid plan' });
    });

    it('should set trial_end if queued and current subscription exists', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 10 * 86400000);

      mockReq.body = { plan: '3-month', queued: true };

      const mockCustomer = { id: 'cus_123' };
      const mockCurrentSub = {
        status: 'active',
        currentPeriodEnd: periodEnd,
      };
      const mockSession = { id: 'cs_456', url: 'https://checkout.stripe.com' };

      stripeService.createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      Subscription.findOne.mockResolvedValue(mockCurrentSub);
      stripeService.createCheckoutSession.mockResolvedValue(mockSession);

      await createCheckout(mockReq, mockRes, mockNext);

      const callArgs = stripeService.createCheckoutSession.mock.calls[0];
      expect(callArgs[2]).toEqual(Math.floor(periodEnd.getTime() / 1000)); // trialEndTimestamp
      expect(callArgs[3]).toEqual({ plan: '3-month', is_queued: 'true' }); // metadata
    });

    it('should handle all valid plans', async () => {
      const plans = ['1-month', '3-month', '6-month', '12-month'];
      const mockCustomer = { id: 'cus_123' };
      const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com' };

      stripeService.createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      Subscription.findOne.mockResolvedValue(null);
      stripeService.createCheckoutSession.mockResolvedValue(mockSession);

      for (const plan of plans) {
        jest.clearAllMocks();
        mockReq.body = { plan, queued: false };

        await createCheckout(mockReq, mockRes, mockNext);

        expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
          mockCustomer.id,
          plan,
          null,
          { plan }
        );
      }
    });
  });

  describe('verifyCheckoutSession', () => {
    it('should verify and return subscription', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      const mockSession = {
        payment_status: 'paid',
        customer: 'cus_123',
        subscription: 'sub_123',
      };

      const mockUser = {
        _id: mockReq.user._id,
        email: mockReq.user.email,
        stripeCustomerId: 'cus_123',
        save: jest.fn(),
      };

      const periodEnd = new Date(Date.now() + 30 * 86400000);
      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: 'sub_123',
        status: 'active',
        plan: '1-month',
        currentPeriodEnd: periodEnd,
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId: mockReq.user._id,
          stripeSubscriptionId: 'sub_123',
          status: 'active',
          plan: '1-month',
          currentPeriodEnd: periodEnd,
        }),
      };

      stripeService.getCheckoutSession.mockResolvedValue(mockSession);
      User.findById.mockResolvedValue(mockUser);
      Subscription.findOne.mockResolvedValue(mockSub);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(stripeService.getCheckoutSession).toHaveBeenCalledWith('cs_123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'active',
          plan: '1-month',
          daysLeft: expect.any(Number),
        }),
      });
    });

    it('should reject unpaid session', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      const mockSession = {
        payment_status: 'unpaid',
      };

      stripeService.getCheckoutSession.mockResolvedValue(mockSession);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or unpaid session' });
    });

    it('should reject if session is null', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      stripeService.getCheckoutSession.mockResolvedValue(null);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or unpaid session' });
    });

    it('should reject customer mismatch', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      const mockSession = {
        payment_status: 'paid',
        customer: 'cus_123',
        subscription: 'sub_123',
      };

      const mockUser = {
        _id: mockReq.user._id,
        email: mockReq.user.email,
        stripeCustomerId: 'cus_different',
        save: jest.fn(),
      };

      stripeService.getCheckoutSession.mockResolvedValue(mockSession);
      User.findById.mockResolvedValue(mockUser);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Customer mismatch' });
    });

    it('should create customer if missing', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      const mockSession = {
        payment_status: 'paid',
        customer: 'cus_123',
        subscription: 'sub_123',
      };

      const mockUser = {
        _id: mockReq.user._id,
        email: mockReq.user.email,
        stripeCustomerId: null,
        save: jest.fn(),
      };

      const mockNewCustomer = { id: 'cus_123' };

      const periodEnd = new Date(Date.now() + 30 * 86400000);
      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: 'sub_123',
        status: 'active',
        plan: '1-month',
        currentPeriodEnd: periodEnd,
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId: mockReq.user._id,
          stripeSubscriptionId: 'sub_123',
          status: 'active',
          plan: '1-month',
          currentPeriodEnd: periodEnd,
        }),
      };

      stripeService.getCheckoutSession.mockResolvedValue(mockSession);
      User.findById.mockResolvedValue(mockUser);
      stripeService.createOrRetrieveCustomer.mockResolvedValue(mockNewCustomer);
      Subscription.findOne.mockResolvedValue(mockSub);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(stripeService.createOrRetrieveCustomer).toHaveBeenCalledWith(mockUser.email);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'active',
        }),
      });
    });

    it('should reject if subscription not found', async () => {
      mockReq.params = { sessionId: 'cs_123' };

      const mockSession = {
        payment_status: 'paid',
        customer: 'cus_123',
        subscription: 'sub_123',
      };

      const mockUser = {
        _id: mockReq.user._id,
        email: mockReq.user.email,
        stripeCustomerId: 'cus_123',
        save: jest.fn(),
      };

      stripeService.getCheckoutSession.mockResolvedValue(mockSession);
      User.findById.mockResolvedValue(mockUser);
      Subscription.findOne.mockResolvedValue(null);

      await verifyCheckoutSession(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Subscription not found' });
    });
  });

  describe('cancel', () => {
    it('should cancel immediately and update DB', async () => {
      mockReq.params = { subscriptionId: 'sub_db_123' };
      mockReq.body = { atPeriodEnd: false };

      const mockSub = {
        _id: 'sub_db_123',
        userId: mockReq.user._id,
        status: 'active',
        stripeSubscriptionId: 'stripe_sub_123',
        canceledAt: null,
        save: jest.fn(),
      };

      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.cancelSubscription.mockResolvedValue({});

      await cancel(mockReq, mockRes, mockNext);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        'stripe_sub_123',
        false
      );
      expect(mockSub.status).toBe('cancelled');
      expect(mockSub.canceledAt).toBeDefined();
      expect(mockSub.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Subscription cancelled immediately',
      });
    });

    it('should schedule cancellation at period end', async () => {
      mockReq.params = { subscriptionId: 'sub_db_123' };
      mockReq.body = { atPeriodEnd: true };

      const mockSub = {
        _id: 'sub_db_123',
        userId: mockReq.user._id,
        status: 'active',
        stripeSubscriptionId: 'stripe_sub_123',
      };

      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.cancelSubscription.mockResolvedValue({});

      await cancel(mockReq, mockRes, mockNext);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        'stripe_sub_123',
        true
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Cancellation scheduled for period end',
      });
    });

    it('should reject if subscription not found', async () => {
      mockReq.params = { subscriptionId: 'sub_db_123' };
      mockReq.body = { atPeriodEnd: false };

      Subscription.findOne.mockResolvedValue(null);

      await cancel(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Subscription not found' });
    });

    it('should not require stripeSubscriptionId to cancel immediately', async () => {
      mockReq.params = { subscriptionId: 'sub_db_123' };
      mockReq.body = { atPeriodEnd: false };

      const mockSub = {
        _id: 'sub_db_123',
        userId: mockReq.user._id,
        status: 'active',
        stripeSubscriptionId: null,
        canceledAt: null,
        save: jest.fn(),
      };

      Subscription.findOne.mockResolvedValue(mockSub);

      await cancel(mockReq, mockRes, mockNext);

      expect(stripeService.cancelSubscription).not.toHaveBeenCalled();
      expect(mockSub.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Subscription cancelled immediately',
      });
    });
  });

  describe('refresh', () => {
    it('should fetch from Stripe and update DB', async () => {
      const periodEnd = new Date(Date.now() + 30 * 86400000);

      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: 'stripe_sub_123',
        status: 'trialing',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId: mockReq.user._id,
          stripeSubscriptionId: 'stripe_sub_123',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        }),
      };

      const mockStripeSub = {
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(periodEnd.getTime() / 1000),
      };

      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.getSubscription.mockResolvedValue(mockStripeSub);

      await refresh(mockReq, mockRes, mockNext);

      expect(stripeService.getSubscription).toHaveBeenCalledWith('stripe_sub_123');
      expect(mockSub.status).toBe('active');
      expect(mockSub.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        subscription: expect.objectContaining({
          status: 'active',
          daysLeft: expect.any(Number),
        }),
      });
    });

    it('should return null if no subscription', async () => {
      Subscription.findOne.mockResolvedValue(null);

      await refresh(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ subscription: null });
    });

    it('should return null if no stripeSubscriptionId', async () => {
      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: null,
      };

      Subscription.findOne.mockResolvedValue(mockSub);

      await refresh(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ subscription: null });
    });

    it('should map Stripe canceled status to cancelled', async () => {
      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: 'stripe_sub_123',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId: mockReq.user._id,
          stripeSubscriptionId: 'stripe_sub_123',
          status: 'cancelled',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        }),
      };

      const mockStripeSub = {
        status: 'canceled',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 86400000) / 1000),
      };

      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.getSubscription.mockResolvedValue(mockStripeSub);

      await refresh(mockReq, mockRes, mockNext);

      expect(mockSub.status).toBe('cancelled');
    });

    it('should map Stripe trialing status to active', async () => {
      const periodEnd = new Date(Date.now() + 30 * 86400000);

      const mockSub = {
        userId: mockReq.user._id,
        stripeSubscriptionId: 'stripe_sub_123',
        status: 'trialing',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          userId: mockReq.user._id,
          stripeSubscriptionId: 'stripe_sub_123',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        }),
      };

      const mockStripeSub = {
        status: 'trialing',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(periodEnd.getTime() / 1000),
      };

      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.getSubscription.mockResolvedValue(mockStripeSub);

      await refresh(mockReq, mockRes, mockNext);

      expect(mockSub.status).toBe('active');
    });
  });
});
