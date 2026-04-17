const express = require('express');

const request = require('supertest');

// --------------------
// 🔒 ENV SETUP
// --------------------
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key';
process.env.STRIPE_WEBHOOK_SECRET =
  'whsec_4c5978863ce9b952c5f9f7a48da28b6136a1b8d63191a99262064360bfac29a8';
// --------------------
// 🧪 MOCK STRIPE
// --------------------
const mockStripeInstance = {
  webhooks: {
    constructEvent: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripeInstance);
});

const stripe = require('stripe');

// --------------------
// 🧪 MOCK MIDDLEWARE
// --------------------
jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => next(),
}));

jest.mock('../../services/webhookUtils', () => ({
  isWebhookEventProcessed: jest.fn(),
  markWebhookEventProcessed: jest.fn(),
}));

jest.mock('../../middleware/inputValidator', () => ({
  preventNoSQLInjection: (req, res, next) => next(),
  stripDangerousFields: (req, res, next) => next(),
  allowOnlyFields: () => (req, res, next) => next(),
  validateObjectId: jest.fn(),
  handleValidationErrors: (req, res, next) => next(),
  limitRequestSize: (req, res, next) => next(),
  validateSortParam: (req, res, next) => next(),
  validateAggregationPipeline: jest.fn(() => true),
}));

// --------------------
// 🧪 MOCK MODELS
// --------------------
const mockSubscriptionFindOne = jest.fn().mockReturnValue({
  lean: jest.fn().mockResolvedValue(null),
});

jest.mock('../../models/Subscription', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: mockSubscriptionFindOne,
}));

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/Purchase', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../models/WebhookEvent', () => ({
  findOne: jest.fn(),
}));

// --------------------
// 🧪 MOCK STRIPE SERVICE
// --------------------
jest.mock('../../services/stripe', () => ({
  getPlanNameFromPriceId: jest.fn().mockResolvedValue('1-month'),
}));

// --------------------
// 📦 IMPORT AFTER MOCKS
// --------------------
const webhookRoute = require('../../routes/webhooks');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../../services/webhookUtils');
const User = require('../../models/User');
const { getPlanNameFromPriceId } = require('../../services/stripe');

// Get Subscription with the lean() mock attached
const SubscriptionModule = require('../../models/Subscription');

// --------------------
// 🚀 TEST APP (ISOLATED)
// --------------------
const app = express();

// IMPORTANT: Stripe needs raw body
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoute);

// --------------------
// 🧪 TESTS
// --------------------
describe('Stripe Webhook Tests', () => {
  const mockEventId = 'evt_test_123';
  const now = Math.floor(Date.now() / 1000);
  const futureDate = new Date(now * 1000 + 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();

    mockStripeInstance.webhooks.constructEvent.mockReturnValue({
      id: mockEventId,
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          status: 'active',
          current_period_start: now,
          current_period_end: now + 30 * 86400,
          items: {
            data: [{ price: { id: 'price_1month', unit_amount: 5000, currency: 'jmd' } }],
          },
          metadata: {},
        },
      },
    });

    isWebhookEventProcessed.mockResolvedValue(false);
    markWebhookEventProcessed.mockResolvedValue();
    User.findOne.mockResolvedValue({ _id: 'user_123', email: 'test@example.com' });

    // Mock Subscription.findOne with lean() support
    mockSubscriptionFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    SubscriptionModule.findOneAndUpdate.mockResolvedValue({
      _id: 'sub_mongo_123',
      stripeSubscriptionId: 'sub_test',
      status: 'active',
      plan: '1-month',
      isQueuedPlan: false,
    });
    User.findOneAndUpdate.mockResolvedValue(null);
    mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_test',
      customer: 'cus_test',
      status: 'active',
      current_period_start: now,
      current_period_end: now + 30 * 86400,
      items: {
        data: [{ price: { id: 'price_1month', unit_amount: 5000, currency: 'jmd' } }],
      },
    });

    getPlanNameFromPriceId.mockResolvedValue('1-month');
  });

  // --------------------
  // 🔐 SIGNATURE TESTS
  // --------------------
  describe('Signature Verification', () => {
    it('returns 400 if signature missing', async () => {
      const res = await request(app).post('/webhooks/stripe').send(Buffer.from('{}'));

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if signature invalid', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'bad_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(400);
    });
  });

  // --------------------
  // 🔁 REPLAY PROTECTION
  // --------------------
  describe('Replay Protection', () => {
    it('skips already processed events', async () => {
      isWebhookEventProcessed.mockResolvedValue(true);

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(markWebhookEventProcessed).not.toHaveBeenCalled();
    });
  });

  // --------------------
  // ⚙️ EVENT HANDLING
  // --------------------
  describe('Event Handling', () => {
    it('processes valid event', async () => {
      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(markWebhookEventProcessed).toHaveBeenCalledWith(
        mockEventId,
        'customer.subscription.created'
      );
    });

    it('handles unrecognized event gracefully', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'unknown.event',
        data: { object: {} },
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
    });
  });

  // --------------------
  // 💥 ERROR RESILIENCE
  // --------------------
  describe('Error Handling', () => {
    it('does not crash on handler error', async () => {
      markWebhookEventProcessed.mockRejectedValue(new Error('DB fail'));

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
    });
  });

  // --------------------
  // 🎯 3-STATE MODEL MAPPING
  // --------------------
  describe('3-State Status Mapping', () => {
    it('processes subscription.created with active status', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_active',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_active',
            customer: 'cus_test',
            status: 'active',
            current_period_start: now,
            current_period_end: now + 30 * 86400,
            items: {
              data: [{ price: { id: 'price_1month' } }],
            },
            metadata: {},
          },
        },
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });

    it('processes subscription.deleted event', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_cancel',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_cancel',
            customer: 'cus_test',
            status: 'canceled',
            canceled_at: now,
          },
        },
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });

    it('processes invoice.paid event', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_paid',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'inv_123',
            subscription: 'sub_test',
            period_start: now,
            period_end: now + 30 * 86400,
          },
        },
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });

    it('processes invoice.payment_failed event', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'inv_456',
            subscription: 'sub_test',
          },
        },
      });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });
  });

  // --------------------
  // 🎟️ QUEUED PLANS
  // --------------------
  describe('Queued Plans', () => {
    it('processes subscription with queued metadata', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        id: 'evt_queued',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_queued',
            customer: 'cus_test',
            status: 'trialing',
            current_period_start: now,
            current_period_end: now + 14 * 86400,
            items: {
              data: [{ price: { id: 'price_3month' } }],
            },
            metadata: { is_queued: 'true' },
          },
        },
      });

      getPlanNameFromPriceId.mockResolvedValue('3-month');

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(Buffer.from('{}'));

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });
  });
});

// --------------------
// 🧹 CLEANUP
// --------------------
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
});
