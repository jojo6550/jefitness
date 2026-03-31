const express = require('express');

const request = require('supertest');

// --------------------
// 🔒 ENV SETUP
// --------------------
process.env.NODE_ENV = 'test';
process.env.STRIPE_WEBHOOK_SECRET =
  'whsec_4c5978863ce9b952c5f9f7a48da28b6136a1b8d63191a99262064360bfac29a8';
// --------------------
// 🧪 MOCK STRIPE
// --------------------
jest.mock('stripe', () => {
  return jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

const stripe = require('stripe');
const mockStripeInstance = stripe();

// --------------------
// 🧪 MOCK MIDDLEWARE
// --------------------
jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => next(), // ✅ FIXED (this was breaking your tests)
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
jest.mock('../../models/Subscription', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/Program', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/Purchase', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../models/WebhookEvent', () => ({
  findOne: jest.fn(),
}));

// --------------------
// 📦 IMPORT AFTER MOCKS
// --------------------
const webhookRoute = require('../../routes/webhooks');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../../middleware/auth');

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
        },
      },
    });

    isWebhookEventProcessed.mockResolvedValue(false);
    markWebhookEventProcessed.mockResolvedValue();
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
});

// --------------------
// 🧹 CLEANUP
// --------------------
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
});
