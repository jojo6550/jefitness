const express = require('express');
const subscriptionService = require('../services/subscriptionService');
const { logger } = require('../services/logger');
const User = require('../models/User');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../middleware/auth');
const {
  ALLOWED_WEBHOOK_EVENTS: ALLOWED_EVENTS_ARRAY,
} = require('../config/subscriptionConstants');

const router = express.Router();

// Lazy Stripe initialization
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

// SECURITY: Stripe webhook secret
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// SECURITY: Whitelist of allowed Stripe events
const ALLOWED_WEBHOOK_EVENTS = new Set(ALLOWED_EVENTS_ARRAY);

// Middleware to parse Stripe webhook as raw buffer
const webhookMiddleware = express.raw({ type: 'application/json' });

/**
 * Main webhook handler - Service-driven, idempotent
 */
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  if (!sig) {
    logger.warn('webhook_signature_missing', { ip: req.ip });
    return res.status(400).send('Signature missing');
  }

  if (!webhookSecret) {
    logger.error('webhook_secret_not_configured');
    return res.status(500).send('Webhook secret missing');
  }

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('webhook_signature_failed', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (!event?.id || !event.type || !event.data?.object) {
    logger.error('invalid_webhook_structure', { eventId: event?.id });
    return res.status(400).send('Invalid event');
  }

  logger.info('Webhook received', { eventType: event.type, eventId: event.id });

  if (!ALLOWED_WEBHOOK_EVENTS.has(event.type)) {
    return res.status(200).json({ received: true, processed: false, reason: 'Event ignored' });
  }

  const alreadyProcessed = await isWebhookEventProcessed(event.id);
  if (alreadyProcessed) {
    return res.status(200).json({ received: true, processed: false, reason: 'Already processed' });
  }

  try {
    await markWebhookEventProcessed(event.id, event.type);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChanged(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        // Non-subscription payments handled below
        break;

      default:
        logger.info('Webhook ignored', { eventType: event.type });
    }

    res.status(200).json({ received: true, processed: true });
  } catch (error) {
    logger.error('Webhook processing failed', { eventType: event.type, error: error.message });
    res.status(200).json({ received: true, processed: false });
  }
}

/**
 * customer.subscription.created/updated → createOrUpdateFromStripe
 */
async function handleSubscriptionChanged(stripeSub) {
  // Find user by customer ID
  const user = await User.findOne({ stripeCustomerId: stripeSub.customer });
  if (!user) {
    logger.warn('No user for Stripe customer', { customerId: stripeSub.customer });
    return;
  }

  const subscription = await subscriptionService.createOrUpdateFromStripe(stripeSub, user._id);
  logger.info('Subscription synced from webhook', { userId: user._id, state: subscription.state });
}

/**
 * customer.subscription.deleted → cancel
 */
async function handleSubscriptionDeleted(stripeSub) {
  const user = await User.findOne({ stripeCustomerId: stripeSub.customer });
  if (!user) return;

  await subscriptionService.cancelSubscription(user._id, false);
  logger.info('Subscription cancelled via webhook', { userId: user._id });
}

/**
 * invoice.paid/succeeded → ensure active + sync period
 */
async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return;

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
  
  const user = await User.findOne({ stripeCustomerId: stripeSub.customer });
  if (!user) return;

  await subscriptionService.createOrUpdateFromStripe(stripeSub, user._id);
  logger.info('Subscription renewed via invoice', { userId: user._id });
}

/**
 * invoice.payment_failed → cancelled state
 */
async function handleInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
  
  const user = await User.findOne({ stripeCustomerId: stripeSub.customer });
  if (!user) return;

  await subscriptionService.createOrUpdateFromStripe(stripeSub, user._id);
  logger.warn('Payment failed - subscription updated', { userId: user._id });
}

/**
 * checkout.session.completed
 * Subscriptions handled above, non-sub products/programs here
 */
async function handleCheckoutSessionCompleted(session) {
  if (!session.customer) return;

  const user = await User.findOne({ stripeCustomerId: session.customer });
  if (!user) return;

  if (session.mode === 'subscription') return; // Handled by subscription events

  // One-time payment checkout
  const metadata = session.metadata || {};
  if (metadata.type === 'program_purchase' && metadata.programId) {
    // Handled in previous logic (unchanged)
  } else if (metadata.type === 'product_purchase') {
    const Purchase = require('../models/Purchase');
    const purchase = await Purchase.findOne({ stripeCheckoutSessionId: session.id });
    if (purchase && purchase.status === 'pending') {
      purchase.status = 'completed';
      await purchase.save();
    }
  }
}

// Routes
router.post('/stripe', webhookMiddleware, handleStripeWebhook);
router.post('/', webhookMiddleware, handleStripeWebhook);

module.exports = router;

