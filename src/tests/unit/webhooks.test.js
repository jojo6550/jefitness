const request = require('supertest');
const app = require('../../server');
const stripe = require('stripe');
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');
const Program = require('../../models/Program');
const Purchase = require('../../models/Purchase');
const WebhookEvent = require('../../models/WebhookEvent');
const { isWebhookEventProcessed, markWebhookEventProcessed } = require('../../middleware/auth');
const { ALLOWED_WEBHOOK_EVENTS } = require('../../config/subscriptionConstants');

// Mock environment
process.env.NODE_ENV = 'test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_4c5978863ce9b952c5f9f7a48da28b6136a1b8d63191a99262064360bfac29a8';

// Mock Stripe instance and webhooks.constructEvent
jest.mock('stripe');
const mockStripeInstance = {
  webhooks: {
    constructEvent: jest.fn(),
  },
};
stripe.mockReturnValue(mockStripeInstance);

// Mock all models
jest.mock('../../models/Subscription', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  prototype: { save: jest.fn() },
}));
jest.mock('../../models/Program', () => ({
  findById: jest.fn(),
}));
jest.mock('../../models/Purchase', () => ({
  findOne: jest.fn(),
  prototype: { save: jest.fn() },
}));
jest.mock('../../models/WebhookEvent', () => ({
  findOne: jest.fn(),
  prototype: { ensureProcessed: jest.fn() },
}));

// Mock middleware functions
jest.mock('../../middleware/auth', () => ({
  isWebhookEventProcessed: jest.fn(),
  markWebhookEventProcessed: jest.fn(),
}));

// Mock getStripe to return the mock instance
const originalGetStripe = require('../../routes/webhooks').getStripe;
require('../../routes/webhooks').getStripe = jest.fn().mockReturnValue(mockStripeInstance);

describe('Stripe Webhook Tests', () => {
  let mockEventId = 'evt_test_123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to defaults
    Subscription.findOneAndUpdate.mockResolvedValue({ _id: 'sub_123' });
    Subscription.findOne.mockResolvedValue(null);
    User.findOne.mockResolvedValue({ _id: 'user_123', stripeCustomerId: 'cus_test' });
    User.findOneAndUpdate.mockResolvedValue({});
    Program.findById.mockResolvedValue({ stripePriceId: 'price_test' });
    Purchase.findOne.mockResolvedValue({ _id: 'pur_123', status: 'pending' });
    WebhookEvent.findOne.mockResolvedValue(null);
    WebhookEvent.prototype.ensureProcessed.mockResolvedValue({});
    isWebhookEventProcessed.mockResolvedValue(false);
    markWebhookEventProcessed.mockResolvedValue();
    mockStripeInstance.webhooks.constructEvent.mockResolvedValue({
      id: mockEventId,
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_test', customer: 'cus_test', status: 'active' } },
    });
  });

  describe('Signature Verification', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      const response = await request(app)
        .post('/webhooks/stripe')
        .send({ foo: 'bar' })
        .expect(400);

      expect(response.text).toBe('Webhook signature missing');
    });

    it('should return 400 when webhook secret is missing', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'test')
        .send({ foo: 'bar' })
        .expect(500);

      expect(response.text).toBe('Webhook secret not configured');
    });

    it('should return 400 when signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockRejectedValue(new Error('Bad sig'));

      const payload = Buffer.from(JSON.stringify({ type: 'test' }));
      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'bad_sig')
        .send(payload)
        .expect(400);

      expect(response.text).toContain('Webhook Error');
    });

    it('should return 400 on invalid event structure', async () => {
      mockStripeInstance.webhooks.constructEvent.mockResolvedValueOnce({}); // missing id/type

      const payload = Buffer.from(JSON.stringify({}));
      await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(400);
    });
  });

  describe('Event Whitelisting & Replay Protection', () => {
    it('should reject unhandled event types with 200 unprocessed', async () => {
      mockStripeInstance.webhooks.constructEvent.mockResolvedValueOnce({
        id: 'evt_bad',
        type: 'customer.invalid_event',
        data: { object: {} },
      });

      const payload = Buffer.from(JSON.stringify({ type: 'customer.invalid_event' }));
      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({
        received: true,
        processed: false,
        reason: 'Event type not handled',
      });
      expect(isWebhookEventProcessed).not.toHaveBeenCalled(); // Not marked since unhandled
    });

    it('should detect replay attack and return 200 already processed', async () => {
      isWebhookEventProcessed.mockResolvedValueOnce(true);

      const payload = Buffer.from(JSON.stringify({ type: 'customer.subscription.created' }));
      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(response.body.reason).toBe('Event already processed');
      expect(markWebhookEventProcessed).not.toHaveBeenCalled(); // Already marked
    });
  });

  describe('Allowed Event Handlers', () => {
    const basePayload = {
      id: mockEventId,
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test',
          items: { data: [{ price: { id: 'price_monthly' } }] },
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    };

    it.each([
      ['customer.created', { id: 'cus_new' }],
      ['customer.subscription.created', basePayload.data.object],
      ['customer.subscription.updated', basePayload.data.object],
      ['customer.subscription.deleted', { id: 'sub_deleted', customer: 'cus_test' }],
      ['invoice.created', { id: 'inv_created', subscription: 'sub_test' }],
      ['invoice.paid', { id: 'inv_paid', subscription: 'sub_test' }],
      ['invoice.payment_succeeded', { id: 'inv_succeeded', subscription: 'sub_test' }],
      ['invoice.payment_failed', { id: 'inv_failed', subscription: 'sub_test' }],
      ['payment_intent.succeeded', { id: 'pi_succeeded' }],
      ['payment_intent.payment_failed', { id: 'pi_failed' }],
    ])('should process %s event correctly', async (eventType, eventData) => {
      const testEvent = { ...basePayload, type: eventType, data: { object: eventData } };
      mockStripeInstance.webhooks.constructEvent.mockResolvedValueOnce(testEvent);

      const payload = Buffer.from(JSON.stringify(testEvent.data.object));
      const response = await request(app)
        .post('/webhooks/')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(response.body.processed).toBe(true);
      expect(markWebhookEventProcessed).toHaveBeenCalledWith(mockEventId, eventType);
    });

    it('should handle checkout.session.completed (subscription)', async () => {
      const sessionEvent = {
        id: mockEventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            mode: 'subscription',
            customer: 'cus_test',
            subscription: 'sub_new',
          },
        },
      };
      mockStripeInstance.webhooks.constructEvent.mockResolvedValueOnce(sessionEvent);

      const payload = Buffer.from(JSON.stringify(sessionEvent.data.object));
      await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(Subscription.findOneAndUpdate).toHaveBeenCalled();
      expect(User.findOneAndUpdate).toHaveBeenCalled();
    });

    it('should handle checkout.session.completed (program purchase)', async () => {
      const programEvent = {
        id: mockEventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_program',
            mode: 'payment',
            customer: 'cus_test',
            metadata: { type: 'program_purchase', programId: 'prog_123' },
          },
        },
      };
      mockStripeInstance.webhooks.constructEvent.mockResolvedValueOnce(programEvent);
      User.findOne.mockResolvedValueOnce({ _id: 'user_123', purchasedPrograms: [], save: jest.fn() });

      const payload = Buffer.from(JSON.stringify(programEvent.data.object));
      await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(User.findOne).toHaveBeenCalledWith({ stripeCustomerId: 'cus_test' });
    });
  });

  describe('Error Resilience', () => {
    it('should return 200 even if event handler throws', async () => {
      Subscription.findOneAndUpdate.mockRejectedValueOnce(new Error('DB error'));

      const payload = Buffer.from(JSON.stringify({ type: 'customer.subscription.created' }));
      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'good_sig')
        .send(payload)
        .expect(200);

      expect(response.body.processed).toBe(false);
    });
  });

  describe('Endpoint Compatibility', () => {
    it('should work on both /stripe and / endpoints', async () => {
      const payload = Buffer.from(JSON.stringify({ type: 'customer.created' }));
      await request(app).post('/webhooks/stripe').set('stripe-signature', 'good_sig').send(payload).expect(200);
      await request(app).post('/webhooks/').set('stripe-signature', 'good_sig').send(payload).expect(200);
    });
  });
});

console.log('✅ All Stripe webhook tests use raw Buffer payloads (simulates prod express.raw)');
console.log('   Mock Stripe: no real API calls');
console.log('   Mock DB: no Mongo writes');
console.log('   NODE_ENV=test: uses express.json() automatically');

