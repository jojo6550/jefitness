import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import subscriptionController from '../../../controllers/subscriptionController.js';
import User from '../../../models/User.js';
import Subscription from '../../../models/Subscription.js';
import * as stripeService from '../../../services/stripe.js';
import { ValidationError, NotFoundError } from '../../../middleware/errorHandler.js';

// Import for testing computeDaysLeft
import { computeDaysLeft } from '../../../controllers/subscriptionController.js';

describe('subscriptionController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      user: { id: 'user123' },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3000')
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
    User.findById.mockReset();
    Subscription.findOne.mockReset();
    stripeService.getStripe.mockReturnValue({
      subscriptions: { retrieve: jest.fn(), list: jest.fn() },
      checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } }
    });
  });

  describe('computeDaysLeft utility', () => {
    it('should compute days left correctly', () => {
      const sub = { currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }; // 3 days
      expect(computeDaysLeft(sub)).toBe(3);
    });

    it('should return 0 for expired subscription', () => {
      const sub = { currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      expect(computeDaysLeft(sub)).toBe(0);
    });
  });

  describe('getPlans', () => {
    it('should return plans from stripeService', async () => {
      const mockPlans = { '1-month': { amount: 999, displayPrice: '$9.99' } };
      stripeService.getPlanPricing.mockResolvedValue(mockPlans);

      await subscriptionController.getPlans(mockReq, mockRes);

      expect(stripeService.getPlanPricing).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: { plans: mockPlans } });
    });
  });

  describe('createCheckout', () => {
    it('should create checkout session - no existing customer', async () => {
      User.findById.mockResolvedValue({ email: 'user@test.com', save: jest.fn() });
      const mockCustomer = { id: 'cus_mock' };
      const mockSession = { id: 'sess_mock', url: 'https://checkout.stripe.com/pay' };
      stripeService.createOrRetrieveCustomer.mockResolvedValue(mockCustomer);
      stripeService.createCheckoutSession.mockResolvedValue(mockSession);

      mockReq.body.planId = 'price_1month';

      await subscriptionController.createCheckout(mockReq, mockRes);

      expect(stripeService.createOrRetrieveCustomer).toHaveBeenCalledWith('user@test.com', null, { userId: 'user123' });
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: { sessionId: 'sess_mock', url: mockSession.url } });
    });

    it('should use existing customer', async () => {
      const mockUser = { _id: 'user123', stripeCustomerId: 'cus_existing', email: 'user@test.com' };
      User.findById.mockResolvedValue(mockUser);

      await subscriptionController.createCheckout(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockUser.save).not.toHaveBeenCalled(); // No new customer
    });

    it('should throw if user not found', async () => {
      User.findById.mockResolvedValue(null);

      await expect(subscriptionController.createCheckout(mockReq, mockRes)).rejects.toThrow(ValidationError);
    });
  });

  describe('getCurrentSubscription', () => {
    it('should return subscription with daysLeft', async () => {
      const mockSub = { 
        userId: 'user123', 
        toObject: () => ({ stripeSubscriptionId: 'sub_mock', currentPeriodEnd: new Date(Date.now() + 86400000) }),
        currentPeriodEnd: new Date(Date.now() + 86400000)
      };
      Subscription.findOne.mockResolvedValue(mockSub);

      await subscriptionController.getCurrentSubscription(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ daysLeft: 1 })
      });
    });

    it('should return null if no subscription', async () => {
      Subscription.findOne.mockResolvedValue(null);

      await subscriptionController.getCurrentSubscription(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: null });
    });
  });

  describe('verifyCheckoutSession', () => {
    it('should verify valid paid session', async () => {
      const mockSession = {
        id: 'sess_valid',
        customer: 'cus_mock',
        subscription: 'sub_mock',
        payment_status: 'paid',
        mode: 'subscription'
      };
      stripeService.getCheckoutSession.mockResolvedValue(mockSession);

      await subscriptionController.verifyCheckoutSession({ ...mockReq, params: { sessionId: 'sess_valid' } }, mockRes);

      expect(stripeService.getCheckoutSession).toHaveBeenCalledWith('sess_valid');
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should reject unpaid/invalid session', async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'unpaid',
        customer: 'cus_mock',
        subscription: 'sub_mock'
      });

      const req = { ...mockReq, params: { sessionId: 'sess_invalid' } };
      await expect(subscriptionController.verifyCheckoutSession(req, mockRes)).rejects.toMatchObject({ status: 400 });
    });

    it('should handle missing STRIPE_SECRET_KEY', async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      const req = { ...mockReq, params: { sessionId: 'sess_test' } };
      await expect(subscriptionController.verifyCheckoutSession(req, mockRes)).rejects.toMatchObject({ status: 500 });

      process.env.STRIPE_SECRET_KEY = originalKey;
    });
  });

  describe('cancel', () => {
    it('should cancel subscription successfully', async () => {
      const mockSub = { _id: 'sub1', userId: 'user123', stripeSubscriptionId: 'sub_stripe' };
      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.cancelSubscription.mockResolvedValue({ status: 'canceled' });

      await subscriptionController.cancel({ ...mockReq, params: { subscriptionId: 'sub1' } }, mockRes);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_stripe', false);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Subscription canceled successfully' });
    });

    it('should throw if not found/unauthorized', async () => {
      Subscription.findOne.mockResolvedValue(null);

      await expect(subscriptionController.cancel({ ...mockReq, params: { subscriptionId: 'unknown' } }, mockRes))
        .rejects.toThrow(NotFoundError);
    });

    it('should continue if Stripe already canceled', async () => {
      const mockSub = { _id: 'sub1', stripeSubscriptionId: 'sub_gone' };
      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.cancelSubscription.mockRejectedValue({ message: 'already canceled' });

      await subscriptionController.cancel({ ...mockReq, params: { subscriptionId: 'sub1' } }, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should refresh subscription from Stripe', async () => {
      const mockUser = { _id: 'user123', stripeSubscriptionId: 'sub_refresh' };
      User.findById.mockResolvedValue(mockUser);
      stripeService.getStripe().subscriptions.retrieve.mockResolvedValue({
        id: 'sub_refresh',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 86400
      });

      await subscriptionController.refresh(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ daysLeft: expect.any(Number) })
      }));
    });
  });

  describe('getSubscriptionInvoices', () => {
    it('should get invoices for subscription', async () => {
      const mockSub = { stripeSubscriptionId: 'sub_invoices', userId: 'user123' };
      Subscription.findOne.mockResolvedValue(mockSub);
      stripeService.getSubscriptionInvoices.mockResolvedValue([{ id: 'inv1' }]);

      await subscriptionController.getSubscriptionInvoices({ ...mockReq, params: { subscriptionId: 'sub_invoices' } }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true, 
        data: expect.any(Array)
      });
    });
  });
});

