const express = require('express');

const Subscription = require('../models/Subscription');
const { logger } = require('../services/logger');
const User = require('../models/User');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../middleware/auth');
const {
  ALLOWED_WEBHOOK_EVENTS: ALLOWED_EVENTS_ARRAY,
} = require('../config/subscriptionConstants');
const { getPlanNameFromPriceId } = require('../services/stripe');

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

// SECURITY: Stripe webhook secret (critical for preventing webhook spoofing)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// SECURITY: Whitelist of allowed Stripe events
const ALLOWED_WEBHOOK_EVENTS = new Set(ALLOWED_EVENTS_ARRAY);

// Middleware to parse Stripe webhook payload as raw buffer
// IMPORTANT: This route must be registered BEFORE express.json() in server.js
// so the body stream is not consumed before Stripe signature verification.
const webhookMiddleware = express.raw({ type: 'application/json' });

// ===== ROUTE =====
// Handler extracted so it can be registered at both /stripe and / (for CLI compatibility)
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  // SECURITY: Verify webhook signature is present
  if (!sig) {
    logger.warn('Security event: webhook_signature_missing', { ip: req.ip || 'unknown' });
    return res.status(400).send('Webhook signature missing');
  }

  // SECURITY: Verify webhook secret is configured
  if (!webhookSecret) {
    logger.error('Security event: webhook_secret_not_configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('Stripe not initialized');
      return res.status(500).send('Stripe not configured');
    }

    // SECURITY: Verify webhook signature using Stripe's official verification.
    // req.body is a raw Buffer here because this route is registered before express.json().
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Security event: webhook_signature_verification_failed', { error: err.message, ip: req.ip });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // SECURITY: Validate event structure
  if (!event || !event.id || !event.type || !event.data || !event.data.object) {
    logger.error('Security event: invalid_webhook_event_structure', { eventId: event?.id || 'unknown' });
    return res.status(400).send('Invalid event structure');
  }

  logger.info('Webhook event received', { eventType: event.type, eventId: event.id });

  // SECURITY: Check if event is in whitelist
  if (!ALLOWED_WEBHOOK_EVENTS.has(event.type)) {
    logger.warn('Unhandled webhook event type', { eventType: event.type, eventId: event.id });
    return res
      .status(200)
      .json({ received: true, processed: false, reason: 'Event type not handled' });
  }

  // SECURITY: Replay protection — check if event was already processed
  const alreadyProcessed = await isWebhookEventProcessed(event.id);
  if (alreadyProcessed) {
    logger.warn('Security event: webhook_replay_attempt', { eventId: event.id, eventType: event.type });
    return res
      .status(200)
      .json({ received: true, processed: false, reason: 'Event already processed' });
  }

  try {
    // SECURITY: Mark event as processed BEFORE handling (prevents race conditions on retries)
    await markWebhookEventProcessed(event.id, event.type);
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object);
        break;

      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      default:
        logger.info('Unhandled event type in switch', { eventType: event.type });
    }

    res.status(200).json({ received: true, processed: true });
  } catch (error) {
    logger.error('Error processing webhook event', { eventType: event.type, eventId: event.id, error: error.message });
    // Always return 200 so Stripe does not keep retrying a bad event.
    // The error is logged for investigation.
    res.status(200).json({ received: true, processed: false, error: error.message });
  }
}

// Register at /stripe (original path) and / (for Stripe CLI forwarding to /webhook)
router.post('/stripe', webhookMiddleware, handleStripeWebhook);
router.post('/', webhookMiddleware, handleStripeWebhook);

// ===== HELPERS =====

/**
 * Build the Subscription upsert payload from a Stripe subscription object.
 */
async function buildSubscriptionPayload(subscription) {
  const priceItem = subscription.items?.data[0];
  const priceId = priceItem?.price?.id;
  const plan = await getPlanNameFromPriceId(priceId);

  return {
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    plan,
    stripePriceId: priceId,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : null,
    amount: priceItem?.price?.unit_amount || 0,
    currency: priceItem?.price?.currency || 'jmd',
    billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
      ? 'test'
      : 'production',
    lastWebhookEventAt: new Date(),
  };
}

async function handleCustomerCreated(customer) {
  logger.info('Stripe customer created', { customerId: customer.id });
}

/**
 * Handles both customer.subscription.created and customer.subscription.updated.
 * Stripe is the source of truth — we upsert the Subscription document to match.
 */
async function handleSubscriptionUpsert(subscription) {
  // Resolve the user by their Stripe customer ID stored in the User document
  const user = await User.findOne({ stripeCustomerId: subscription.customer });

  if (!user) {
    logger.warn('No user found for Stripe customer', { customerId: subscription.customer, subscriptionId: subscription.id });
    return;
  }

  const payload = await buildSubscriptionPayload(subscription);

  const doc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { $set: { userId: user._id, ...payload } },
    { upsert: true, new: true }
  );

  logger.info('Subscription upserted', { docId: doc._id, status: doc.status, plan: doc.plan });

  // Sync subscription ID to user account data (fixes bug where account not updated after successful transaction)
  await User.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        stripeSubscriptionId: subscription.id,
        billingEnvironment: payload.billingEnvironment,
      },
    }
  );
  logger.info('User account synced', { userId: user._id, subscriptionId: subscription.id });
}

/**
 * Handles customer.subscription.deleted.
 * Marks the subscription as canceled in MongoDB.
 */
async function handleSubscriptionDeleted(subscription) {
  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    {
      $set: {
        status: 'canceled',
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : new Date(),
        lastWebhookEventAt: new Date(),
      },
    },
    { new: true }
  );

  if (!sub) {
    logger.warn('Subscription not found in DB on deletion event', { stripeSubscriptionId: subscription.id });
  } else {
    logger.info('Subscription canceled in DB', { stripeSubscriptionId: subscription.id });
  }
}

async function handleInvoiceCreated(invoice) {
  logger.info('Invoice created', { invoiceId: invoice.id });
}

/**
 * Handles invoice.paid and invoice.payment_succeeded.
 * Ensures subscription status is 'active' and period dates are current.
 */
async function handleInvoicePaid(invoice) {
  logger.info('Invoice paid', { invoiceId: invoice.id });
  if (!invoice.subscription) return;

  const stripe = getStripe();
  let currentPeriodEnd = null;
  let currentPeriodStart = null;

  // Fetch latest subscription data from Stripe to get accurate period dates
  try {
    if (stripe) {
      const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
      currentPeriodStart = stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : null;
      currentPeriodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null;
    }
  } catch (err) {
    logger.warn('Could not fetch subscription from Stripe', { stripeSubscriptionId: invoice.subscription, error: err.message });
  }

  const updatePayload = {
    status: 'active',
    lastWebhookEventAt: new Date(),
  };
  if (currentPeriodStart) updatePayload.currentPeriodStart = currentPeriodStart;
  if (currentPeriodEnd) updatePayload.currentPeriodEnd = currentPeriodEnd;

  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { $set: updatePayload },
    { new: true }
  );

  if (sub) {
    logger.info('Subscription activated/renewed in DB', { docId: sub._id });
  } else {
    logger.warn('Subscription not found in DB on invoice.paid', { stripeSubscriptionId: invoice.subscription });
  }
}

/**
 * Handles invoice.payment_failed.
 * Marks the subscription as past_due in MongoDB.
 */
async function handleInvoicePaymentFailed(invoice) {
  logger.warn('Invoice payment failed', { invoiceId: invoice.id });
  if (!invoice.subscription) return;

  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { $set: { status: 'past_due', lastWebhookEventAt: new Date() } },
    { new: true }
  );

  if (sub) {
    logger.warn('Subscription marked past_due in DB', { docId: sub._id });
  } else {
    logger.warn('Subscription not found in DB on payment_failed', { stripeSubscriptionId: invoice.subscription });
  }
}

async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    logger.info('Payment intent succeeded', { paymentIntentId: paymentIntent.id });

    // Find purchase by payment intent ID
    const Purchase = require('../models/Purchase');
    const purchase = await Purchase.findOne({ stripePaymentIntentId: paymentIntent.id });

    if (!purchase) {
      logger.warn('No purchase found for payment intent', { paymentIntentId: paymentIntent.id });
      return;
    }

    // Update purchase status to completed
    purchase.status = 'completed';
    await purchase.save();

    logger.info('Purchase marked as completed', { purchaseId: purchase._id, paymentIntentId: paymentIntent.id });
  } catch (err) {
    logger.error('Error handling payment intent succeeded', {
      paymentIntentId: paymentIntent.id,
      error: err.message
    });
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  try {
    logger.warn('Payment intent failed', { paymentIntentId: paymentIntent.id });

    // Find purchase by payment intent ID
    const Purchase = require('../models/Purchase');
    const purchase = await Purchase.findOne({ stripePaymentIntentId: paymentIntent.id });

    if (!purchase) {
      logger.warn('No purchase found for payment intent', { paymentIntentId: paymentIntent.id });
      return;
    }

    // Update purchase status to failed
    purchase.status = 'failed';
    await purchase.save();

    logger.info('Purchase marked as failed', { purchaseId: purchase._id, paymentIntentId: paymentIntent.id });
  } catch (err) {
    logger.error('Error handling payment intent failed', {
      paymentIntentId: paymentIntent.id,
      error: err.message
    });
  }
}

/**
 * Handles checkout.session.completed.
 * For subscription mode: upserts the Subscription document.
 * For payment mode: handles program purchases and product purchases.
 */
async function handleCheckoutSessionCompleted(session) {
  logger.info('Checkout session completed', { sessionId: session.id });

  if (!session.customer) {
    logger.warn('Checkout session has no customer ID', { sessionId: session.id });
    return;
  }

  const user = await User.findOne({ stripeCustomerId: session.customer });
  if (!user) {
    logger.warn('No user found for Stripe customer', { customerId: session.customer });
    return;
  }

  // --- Subscription checkout ---
  if (session.mode === 'subscription' && session.subscription) {
    const stripe = getStripe();
    let stripeSub;

    try {
      if (stripe) {
        stripeSub = await stripe.subscriptions.retrieve(session.subscription);
      }
    } catch (err) {
      logger.warn('Could not fetch subscription from Stripe on checkout', { error: err.message });
    }

    if (stripeSub) {
      const payload = await buildSubscriptionPayload(stripeSub);
      const doc = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: session.subscription },
        { $set: { userId: user._id, ...payload, checkoutSessionId: session.id } },
        { upsert: true, new: true }
      );
      logger.info('Subscription upserted via checkout', { docId: doc._id, plan: doc.plan });

      // Sync subscription ID to user account data (fixes bug where account not updated after successful transaction)
      await User.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            stripeSubscriptionId: session.subscription,
            billingEnvironment: payload.billingEnvironment,
          },
        }
      );
      logger.info('User account synced via checkout', { userId: user._id, subscriptionId: session.subscription });
    }
    return;
  }

  // --- One-time payment checkout ---
  if (session.mode === 'payment') {
    const { metadata } = session;

    if (metadata?.type === 'program_purchase' && metadata?.programId) {
      const programId = metadata.programId;
      // SECURITY: Validate MongoDB ObjectId format
      if (!/^[0-9a-fA-F]{24}$/.test(programId)) {
        logger.error('Invalid program ID format in checkout metadata', { programId });
        return;
      }

      const alreadyPurchased = user.purchasedPrograms.some(
        p => p.programId.toString() === programId
      );

      if (!alreadyPurchased) {
        const Program = require('../models/Program');
        const program = await Program.findById(programId);

        user.purchasedPrograms.push({
          programId,
          purchasedAt: new Date(),
          stripeCheckoutSessionId: session.id,
          stripePriceId: program?.stripePriceId,
          amountPaid: session.amount_total, // SECURITY: use server-side amount from Stripe
        });
        await user.save();
        logger.info('Program purchased', { programId, userId: user._id });
      } else {
        logger.info('Program already purchased', { programId, userId: user._id });
      }
    } else if (metadata?.programId) {
      // Legacy: trainer-assigned programs
      const programId = metadata.programId;
      const alreadyAssigned = user.assignedPrograms.some(
        ap => ap.programId.toString() === programId
      );
      if (!alreadyAssigned) {
        user.assignedPrograms.push({ programId, assignedAt: new Date() });
        await user.save();
        logger.info('Program assigned to user', { programId, userId: user._id });
      }
    } else if (metadata?.type === 'product_purchase') {
      const Purchase = require('../models/Purchase');
      const purchase = await Purchase.findOne({ stripeCheckoutSessionId: session.id });

      if (purchase && purchase.status === 'pending') {
        purchase.stripePaymentIntentId = session.payment_intent;
        purchase.status = 'completed';
        await purchase.save();
        logger.info('Product purchase completed', { purchaseId: purchase._id, userId: user._id });
      } else {
        logger.warn('Purchase record not found or already processed', { sessionId: session.id });
      }
    }
  }
}

module.exports = router;
