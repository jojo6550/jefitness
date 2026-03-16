const express = require('express');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { isWebhookEventProcessed, markWebhookEventProcessed } = require('../middleware/auth');

const { PLAN_MAP, ALLOWED_WEBHOOK_EVENTS: ALLOWED_EVENTS_ARRAY } = require('../config/subscriptionConstants');

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
const webhookMiddleware =
  process.env.NODE_ENV === 'test'
    ? express.json()
    : express.raw({ type: 'application/json' });

// ===== ROUTE =====
// Handler extracted so it can be registered at both /stripe and / (for CLI compatibility)
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  // SECURITY: Verify webhook signature is present
  if (!sig) {
    console.error('⚠️ Security event: webhook_signature_missing | IP: ' + (req.ip || 'unknown'));
    return res.status(400).send('Webhook signature missing');
  }

  // SECURITY: Verify webhook secret is configured
  if (!webhookSecret) {
    console.error('⚠️ Security event: webhook_secret_not_configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      console.error('⚠️ Stripe not initialized');
      return res.status(500).send('Stripe not configured');
    }

    // SECURITY: Verify webhook signature using Stripe's official verification.
    // req.body is a raw Buffer here because this route is registered before express.json().
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Security event: webhook_signature_verification_failed | Error: ${err.message} | IP: ${req.ip}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // SECURITY: Validate event structure
  if (!event || !event.id || !event.type || !event.data || !event.data.object) {
    console.error('⚠️ Security event: invalid_webhook_event_structure | EventId: ' + (event?.id || 'unknown'));
    return res.status(400).send('Invalid event structure');
  }

  console.log(`📨 Webhook event received: ${event.type} | EventId: ${event.id}`);

  // SECURITY: Check if event is in whitelist
  if (!ALLOWED_WEBHOOK_EVENTS.has(event.type)) {
    console.warn(`⚠️ Unhandled webhook event type: ${event.type} | EventId: ${event.id}`);
    return res.status(200).json({ received: true, processed: false, reason: 'Event type not handled' });
  }

  // SECURITY: Replay protection — check if event was already processed
  const alreadyProcessed = await isWebhookEventProcessed(event.id);
  if (alreadyProcessed) {
    console.warn(`⚠️ Security event: webhook_replay_attempt | EventId: ${event.id} | EventType: ${event.type}`);
    return res.status(200).json({ received: true, processed: false, reason: 'Event already processed' });
  }

  // SECURITY: Mark event as processed BEFORE handling (prevents race conditions on retries)
  await markWebhookEventProcessed(event.id, event.type);

  try {
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
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error(`❌ Error processing webhook event ${event.type} (${event.id}):`, error);
    // Always return 200 so Stripe does not keep retrying a bad event.
    // The error is logged for investigation.
    res.status(200).json({ received: true, processed: false, error: error.message });
  }
}

// Register at /stripe (original path) and / (for Stripe CLI forwarding to /webhook)
router.post('/stripe', webhookMiddleware, handleStripeWebhook);
router.post('/', webhookMiddleware, handleStripeWebhook);

// ===== HELPERS =====

const getPlanFromPrice = (priceId) => PLAN_MAP[priceId] || 'unknown-plan';

/**
 * Build the Subscription upsert payload from a Stripe subscription object.
 */
function buildSubscriptionPayload(subscription) {
  const priceItem = subscription.items?.data[0];
  const priceId = priceItem?.price?.id;
  const plan = getPlanFromPrice(priceId);

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
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    amount: priceItem?.price?.unit_amount || 0,
    currency: priceItem?.price?.currency || 'jmd',
    billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production',
    lastWebhookEventAt: new Date(),
  };
}

async function handleCustomerCreated(customer) {
  console.log(`✅ Customer created: ${customer.id}`);
}

/**
 * Handles both customer.subscription.created and customer.subscription.updated.
 * Stripe is the source of truth — we upsert the Subscription document to match.
 */
async function handleSubscriptionUpsert(subscription) {
  // Resolve the user by their Stripe customer ID stored in the User document
  const user = await User.findOne({ stripeCustomerId: subscription.customer });

  if (!user) {
    console.warn(`⚠️ No user found for Stripe customer ${subscription.customer} (subscription: ${subscription.id})`);
    return;
  }

  const payload = buildSubscriptionPayload(subscription);

  const doc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { $set: { userId: user._id, ...payload } },
    { upsert: true, new: true }
  );

  console.log(`✅ Subscription upserted: ${doc._id} | status: ${doc.status} | plan: ${doc.plan}`);

  // Sync subscription ID to user account data (fixes bug where account not updated after successful transaction)
  await User.findOneAndUpdate(
    { _id: user._id },
    { 
      $set: { 
        stripeSubscriptionId: subscription.id,
        billingEnvironment: payload.billingEnvironment
      }
    }
  );
  console.log(`✅ User account synced: ${user._id} | sub: ${subscription.id}`);

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
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
        lastWebhookEventAt: new Date()
      }
    },
    { new: true }
  );

  if (!sub) {
    console.warn(`⚠️ Subscription ${subscription.id} not found in DB on deletion event`);
  } else {
    console.log(`✅ Subscription canceled in DB: ${subscription.id}`);
  }
}

async function handleInvoiceCreated(invoice) {
  console.log(`ℹ️ Invoice created: ${invoice.id}`);
}

/**
 * Handles invoice.paid and invoice.payment_succeeded.
 * Ensures subscription status is 'active' and period dates are current.
 */
async function handleInvoicePaid(invoice) {
  console.log(`✅ Invoice paid: ${invoice.id}`);
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
    console.warn(`⚠️ Could not fetch subscription ${invoice.subscription} from Stripe: ${err.message}`);
  }

  const updatePayload = {
    status: 'active',
    lastWebhookEventAt: new Date()
  };
  if (currentPeriodStart) updatePayload.currentPeriodStart = currentPeriodStart;
  if (currentPeriodEnd) updatePayload.currentPeriodEnd = currentPeriodEnd;

  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { $set: updatePayload },
    { new: true }
  );

  if (sub) {
    console.log(`✅ Subscription activated/renewed in DB: ${sub._id}`);
  } else {
    console.warn(`⚠️ Subscription ${invoice.subscription} not found in DB on invoice.paid`);
  }
}

/**
 * Handles invoice.payment_failed.
 * Marks the subscription as past_due in MongoDB.
 */
async function handleInvoicePaymentFailed(invoice) {
  console.log(`❌ Invoice payment failed: ${invoice.id}`);
  if (!invoice.subscription) return;

  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { $set: { status: 'past_due', lastWebhookEventAt: new Date() } },
    { new: true }
  );

  if (sub) {
    console.log(`❌ Subscription marked past_due in DB: ${sub._id}`);
  } else {
    console.warn(`⚠️ Subscription ${invoice.subscription} not found in DB on payment_failed`);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log(`✅ Payment intent succeeded: ${paymentIntent.id}`);
}

async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`❌ Payment intent failed: ${paymentIntent.id}`);
}

/**
 * Handles checkout.session.completed.
 * For subscription mode: upserts the Subscription document.
 * For payment mode: handles program purchases and product purchases.
 */
async function handleCheckoutSessionCompleted(session) {
  console.log(`✅ Checkout session completed: ${session.id}`);

  if (!session.customer) {
    console.warn(`⚠️ Checkout session ${session.id} has no customer ID`);
    return;
  }

  const user = await User.findOne({ stripeCustomerId: session.customer });
  if (!user) {
    console.warn(`⚠️ No user found for Stripe customer ${session.customer}`);
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
      console.warn(`⚠️ Could not fetch subscription from Stripe: ${err.message}`);
    }

    if (stripeSub) {
      const payload = buildSubscriptionPayload(stripeSub);
      const doc = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: session.subscription },
        { $set: { userId: user._id, ...payload, checkoutSessionId: session.id } },
        { upsert: true, new: true }
      );
      console.log(`✅ Subscription upserted via checkout: ${doc._id} | plan: ${doc.plan}`);

      // Sync subscription ID to user account data (fixes bug where account not updated after successful transaction)
      await User.findOneAndUpdate(
        { _id: user._id },
        { 
          $set: { 
            stripeSubscriptionId: session.subscription,
            billingEnvironment: payload.billingEnvironment
          }
        }
      );
      console.log(`✅ User account synced via checkout: ${user._id} | sub: ${session.subscription}`);

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
        console.error(`⚠️ Invalid program ID format: ${programId}`);
        return;
      }

      const alreadyPurchased = user.purchasedPrograms.some(
        (p) => p.programId.toString() === programId
      );

      if (!alreadyPurchased) {
        const Program = require('../models/Program');
        const program = await Program.findById(programId);

        user.purchasedPrograms.push({
          programId,
          purchasedAt: new Date(),
          stripeCheckoutSessionId: session.id,
          stripePriceId: program?.stripePriceId,
          amountPaid: session.amount_total // SECURITY: use server-side amount from Stripe
        });
        await user.save();
        console.log(`✅ Program ${programId} purchased by user ${user._id}`);
      } else {
        console.log(`ℹ️ Program ${programId} already purchased by user ${user._id}`);
      }
    } else if (metadata?.programId) {
      // Legacy: trainer-assigned programs
      const programId = metadata.programId;
      const alreadyAssigned = user.assignedPrograms.some(
        (ap) => ap.programId.toString() === programId
      );
      if (!alreadyAssigned) {
        user.assignedPrograms.push({ programId, assignedAt: new Date() });
        await user.save();
        console.log(`✅ Program ${programId} assigned to user ${user._id}`);
      }
    } else if (metadata?.type === 'product_purchase') {
      const Purchase = require('../models/Purchase');
      const purchase = await Purchase.findOne({ stripeCheckoutSessionId: session.id });

      if (purchase && purchase.status === 'pending') {
        purchase.stripePaymentIntentId = session.payment_intent;
        purchase.status = 'completed';
        await purchase.save();
        console.log(`✅ Product purchase ${purchase._id} completed for user ${user._id}`);
      } else {
        console.warn(`⚠️ Purchase record not found or already processed for session ${session.id}`);
      }
    }
  }
}

module.exports = router;
