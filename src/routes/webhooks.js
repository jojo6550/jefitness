const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const router = express.Router();

/**
 * Webhook signature verification
 * Stripe sends requests signed with your endpoint's secret
 * You can find this in: https://dashboard.stripe.com/webhooks
 */
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /webhooks/stripe
 * Receive and process Stripe webhook events
 * 
 * This endpoint handles the following events:
 * - customer.created: When a customer is created in Stripe
 * - customer.subscription.created: When a subscription is created
 * - customer.subscription.updated: When a subscription is updated
 * - customer.subscription.deleted: When a subscription is canceled/deleted
 * - invoice.created: When an invoice is created
 * - invoice.payment_succeeded: When an invoice payment succeeds
 * - invoice.payment_failed: When an invoice payment fails
 * - payment_intent.succeeded: When a payment intent succeeds
 * - payment_intent.payment_failed: When a payment intent fails
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error(`⚠️ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log the event
  console.log(`📨 Received webhook event: ${event.type}`);

  try {
    // Handle different event types
    switch (event.type) {
      // ===== CUSTOMER EVENTS =====
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;

      // ===== SUBSCRIPTION EVENTS =====
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      // ===== INVOICE EVENTS =====
      case 'invoice.created':
        await handleInvoiceCreated(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      // ===== PAYMENT INTENT EVENTS =====
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);
    // Still return 200 to prevent Stripe from retrying
    // Log this for manual review
    res.json({ 
      received: true,
      error: error.message 
    });
  }
});

// ===========================
// EVENT HANDLER FUNCTIONS
// ===========================

/**
 * Handle customer.created event
 * Called when a Stripe customer is created
 */
async function handleCustomerCreated(customer) {
  console.log(`✅ Customer created: ${customer.id}`);
  
  // Customer metadata already contains user info from creation
  // Store additional info if needed
}

/**
 * Handle customer.subscription.created event
 * Called when a subscription is created in Stripe
 */
async function handleSubscriptionCreated(subscription) {
  console.log(`✅ Subscription created: ${subscription.id}`);

  try {
    // Check if subscription already exists in DB
    const existing = await Subscription.findOne({ 
      stripeSubscriptionId: subscription.id 
    });

    if (existing) {
      console.log(`Subscription ${subscription.id} already exists in database`);
      return;
    }

    // Get plan from price
    let plan = '1-month';
    const priceId = subscription.items.data[0]?.price.id;
    
    // Match price ID to plan
    const planMap = {
      [process.env.STRIPE_PRICE_1_MONTH || 'price_1NfYT7GBrdnKY4igWvWr9x7q']: '1-month',
      [process.env.STRIPE_PRICE_3_MONTH || 'price_1NfYT7GBrdnKY4igX2Ks1a8r']: '3-month',
      [process.env.STRIPE_PRICE_6_MONTH || 'price_1NfYT7GBrdnKY4igY3Lt2b9s']: '6-month',
      [process.env.STRIPE_PRICE_12_MONTH || 'price_1NfYT7GBrdnKY4igZ4Mu3c0t']: '12-month'
    };

    if (planMap[priceId]) {
      plan = planMap[priceId];
    }

    // Get pricing info
    const PLAN_PRICING = {
      '1-month': { amount: 999 },
      '3-month': { amount: 2799 },
      '6-month': { amount: 4999 },
      '12-month': { amount: 8999 }
    };

    // Create subscription record in database
    const newSubscription = new Subscription({
      userId: null, // Will be populated from customer metadata if available
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      plan,
      stripePriceId: priceId,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      status: subscription.status,
      amount: PLAN_PRICING[plan].amount,
      paymentMethodId: subscription.default_payment_method,
      lastWebhookEventAt: new Date()
    });

    await newSubscription.save();
    console.log(`✅ Subscription saved to database: ${subscription.id}`);

  } catch (error) {
    console.error(`Error handling subscription created event:`, error);
    throw error;
  }
}

/**
 * Handle customer.subscription.updated event
 * Called when a subscription is updated (plan changed, payment method updated, etc.)
 */
async function handleSubscriptionUpdated(subscription) {
  console.log(`✅ Subscription updated: ${subscription.id}`);

  try {
    // Find subscription in database
    const dbSubscription = await Subscription.findOne({ 
      stripeSubscriptionId: subscription.id 
    });

    if (!dbSubscription) {
      console.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    // Update subscription status
    dbSubscription.status = subscription.status;
    dbSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    dbSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    dbSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
    dbSubscription.paymentMethodId = subscription.default_payment_method;
    dbSubscription.lastWebhookEventAt = new Date();

    await dbSubscription.save();
    console.log(`✅ Subscription updated in database: ${subscription.id}`);

  } catch (error) {
    console.error(`Error handling subscription updated event:`, error);
    throw error;
  }
}

/**
 * Handle customer.subscription.deleted event
 * Called when a subscription is canceled or deleted
 */
async function handleSubscriptionDeleted(subscription) {
  console.log(`✅ Subscription deleted: ${subscription.id}`);

  try {
    // Find subscription in database
    const dbSubscription = await Subscription.findOne({ 
      stripeSubscriptionId: subscription.id 
    });

    if (!dbSubscription) {
      console.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    // Update subscription status
    dbSubscription.status = 'canceled';
    dbSubscription.canceledAt = new Date();
    dbSubscription.lastWebhookEventAt = new Date();

    await dbSubscription.save();
    console.log(`✅ Subscription marked as canceled in database: ${subscription.id}`);

  } catch (error) {
    console.error(`Error handling subscription deleted event:`, error);
    throw error;
  }
}

/**
 * Handle invoice.created event
 * Called when an invoice is created for a subscription
 */
async function handleInvoiceCreated(invoice) {
  console.log(`✅ Invoice created: ${invoice.id}`);
  // Could send notification here
}

/**
 * Handle invoice.payment_succeeded event
 * Called when an invoice payment is successful
 */
async function handleInvoicePaymentSucceeded(invoice) {
  console.log(`✅ Invoice payment succeeded: ${invoice.id}`);

  try {
    if (invoice.subscription) {
      // Find subscription in database
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: invoice.subscription 
      });

      if (subscription) {
        // Update subscription status to active
        subscription.status = 'active';
        subscription.lastWebhookEventAt = new Date();

        // Add invoice to invoice history
        if (!subscription.invoices) {
          subscription.invoices = [];
        }

        subscription.invoices.push({
          stripeInvoiceId: invoice.id,
          amount: invoice.amount_paid,
          status: invoice.status,
          paidAt: new Date(invoice.paid_date * 1000),
          dueDatetime: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
          url: invoice.hosted_invoice_url
        });

        await subscription.save();
        console.log(`✅ Payment recorded for subscription: ${invoice.subscription}`);

        // TODO: Send email confirmation to customer
        // sendPaymentSuccessEmail(subscription.userId, invoice);
      }
    }
  } catch (error) {
    console.error(`Error handling invoice payment succeeded event:`, error);
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 * Called when an invoice payment fails
 */
async function handleInvoicePaymentFailed(invoice) {
  console.log(`❌ Invoice payment failed: ${invoice.id}`);

  try {
    if (invoice.subscription) {
      // Find subscription in database
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: invoice.subscription 
      });

      if (subscription) {
        // Update subscription status to past_due
        subscription.status = 'past_due';
        subscription.lastWebhookEventAt = new Date();
        await subscription.save();
        console.log(`❌ Subscription marked as past_due: ${invoice.subscription}`);

        // TODO: Send payment failure notification to customer
        // sendPaymentFailureEmail(subscription.userId, invoice);
      }
    }
  } catch (error) {
    console.error(`Error handling invoice payment failed event:`, error);
    throw error;
  }
}

/**
 * Handle payment_intent.succeeded event
 * Called when a payment intent succeeds
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log(`✅ Payment intent succeeded: ${paymentIntent.id}`);
  // Additional logic if needed
}

/**
 * Handle payment_intent.payment_failed event
 * Called when a payment intent fails
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`❌ Payment intent failed: ${paymentIntent.id}`);
  // Additional logic if needed
}

module.exports = router;
