const express = require('express');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

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

// Stripe webhook secret
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ===== DYNAMIC PLAN MAP =====
// Add new plans here only
const PLAN_MAP = {
  [process.env.STRIPE_PRICE_1_MONTH]: '1-month',
  [process.env.STRIPE_PRICE_3_MONTH]: '3-month',
  [process.env.STRIPE_PRICE_6_MONTH]: '6-month',
  [process.env.STRIPE_PRICE_12_MONTH]: '12-month',
};

// Middleware to parse Stripe webhook payload correctly
const webhookMiddleware =
  process.env.NODE_ENV === 'test'
    ? express.json()
    : express.raw({ type: 'application/json' });

// ===== ROUTE =====
router.post('/stripe', webhookMiddleware, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe not initialized');

    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Received webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object, event.type === 'customer.subscription.updated');
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
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

    res.send('Webhook received');
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);
    res.json({ received: true, error: error.message });
  }
});

// ===== HELPERS =====

// Get plan dynamically from price ID
const getPlanFromPrice = (priceId) => PLAN_MAP[priceId] || 'unknown-plan';

async function handleCustomerCreated(customer) {
  console.log(`✅ Customer created: ${customer.id}`);
}

async function handleSubscriptionUpsert(subscription, isUpdate = false) {
  const user = await User.findOne({ stripeCustomerId: subscription.customer }) ||
               await User.findOne({ stripeSubscriptionId: subscription.id });

  if (!user) {
    console.warn(`User not found for subscription ${subscription.id}`);
    return;
  }

  const priceId = subscription.items?.data[0]?.price?.id;
  const plan = getPlanFromPrice(priceId);

  if (isUpdate) {
    user.subscription = {
      isActive: subscription.status === 'active',
      plan,
      stripePriceId: priceId,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
    };
    await user.save();
    console.log(`✅ User subscription updated: ${user._id}, plan: ${plan}`);
  } else {
    const subscriptionDoc = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        userId: user._id,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        plan,
        stripePriceId: priceId,
        currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production',
        amount: subscription.items?.data[0]?.price?.unit_amount || 0,
        currency: subscription.items?.data[0]?.price?.currency || 'jmd',
        lastWebhookEventAt: new Date(),
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Subscription created: ${subscriptionDoc._id}, plan: ${plan}`);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { status: 'canceled', canceledAt: new Date(), lastWebhookEventAt: new Date() },
    { new: true }
  );

  if (!sub) console.warn(`Subscription ${subscription.id} not found`);
  else console.log(`✅ Subscription canceled: ${subscription.id}`);
}

async function handleInvoiceCreated(invoice) {
  console.log(`✅ Invoice created: ${invoice.id}`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  console.log(`✅ Invoice payment succeeded: ${invoice.id}`);
  if (!invoice.subscription) return;

  const sub = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { status: 'active', lastWebhookEventAt: new Date() },
    { new: true }
  );

  if (sub) console.log(`✅ Subscription activated: ${sub._id}`);
}

async function handleInvoicePaymentFailed(invoice) {
  console.log(`❌ Invoice payment failed: ${invoice.id}`);
  if (!invoice.subscription) return;

  const user = await User.findOne({ stripeSubscriptionId: invoice.subscription });
  if (!user) return;

  user.subscriptionStatus = 'past_due';
  await user.save();
  console.log(`❌ User subscription marked past_due: ${user._id}`);
}

async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log(`✅ Payment intent succeeded: ${paymentIntent.id}`);
}

async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`❌ Payment intent failed: ${paymentIntent.id}`);
}

async function handleCheckoutSessionCompleted(session) {
  console.log(`✅ Checkout session completed: ${session.id}`);
  const user = await User.findOne({ stripeCustomerId: session.customer });
  if (!user) return;

  const stripe = getStripe();
  let subscription;

  if (session.mode === 'subscription' && stripe && session.subscription) {
    try { subscription = await stripe.subscriptions.retrieve(session.subscription); }
    catch (err) { console.warn(`Could not fetch subscription from Stripe: ${err.message}`); }

    const priceId = subscription?.items?.data[0]?.price?.id || session.subscription?.items?.data[0]?.price?.id;
    const plan = getPlanFromPrice(priceId);

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: session.subscription },
      {
        userId: user._id,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        plan,
        stripePriceId: priceId,
        currentPeriodStart: subscription?.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
        currentPeriodEnd: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        status: subscription?.status || 'active',
        cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
        billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production',
        amount: subscription?.items?.data[0]?.price?.unit_amount || 0,
        currency: subscription?.items?.data[0]?.price?.currency || 'jmd',
        checkoutSessionId: session.id,
        lastWebhookEventAt: new Date(),
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Subscription updated via checkout session, plan: ${plan}`);
  }

  if (session.mode === 'payment') {
    if (session.metadata?.programId) {
      // Handle program purchases
      const programId = session.metadata.programId;
      const alreadyAssigned = user.assignedPrograms.some(ap => ap.programId.toString() === programId);
      if (!alreadyAssigned) {
        user.assignedPrograms.push({ programId, assignedAt: new Date() });
        await user.save();
        console.log(`✅ Program ${programId} assigned to user ${user._id}`);
      } else {
        console.log(`ℹ️ Program ${programId} already assigned to user ${user._id}`);
      }
    } else if (session.metadata?.type === 'product_purchase') {
      // Handle product purchases
      const Purchase = require('../models/Purchase');
      const purchase = await Purchase.findOne({ stripeCheckoutSessionId: session.id });

      if (purchase && purchase.status === 'pending') {
        // Update purchase record with payment details
        purchase.stripePaymentIntentId = session.payment_intent;
        purchase.status = 'completed';
        await purchase.save();
        console.log(`✅ Product purchase ${purchase._id} completed for user ${user._id}`);
      } else {
        console.warn(`Purchase record not found or already processed for session ${session.id}`);
      }
    }
  }
}

module.exports = router;
