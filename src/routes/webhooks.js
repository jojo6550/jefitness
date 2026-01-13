const express = require('express');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const router = express.Router();

// Lazy initialization of Stripe to avoid issues in test environment
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

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
router.post('/stripe', process.env.NODE_ENV === 'test' ? express.json() : express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify the event came from Stripe
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
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

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.send('Webhook received');
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
    // Find user by Stripe customer ID
    const user = await User.findOne({ stripeCustomerId: subscription.customer });

    if (!user) {
      console.warn(`User not found for customer ${subscription.customer}`);
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

    // Update user subscription data
    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status;
    user.subscriptionType = plan;
    user.stripePriceId = priceId;
    user.currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    user.currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
    user.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';

    await user.save();
    console.log(`✅ User subscription updated: ${user._id}`);

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
    // Find user by Stripe subscription ID
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });

    if (!user) {
      console.warn(`User not found for subscription ${subscription.id}`);
      return;
    }

    // Get updated plan from price
    let plan = user.subscriptionType || '1-month';
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

    // Update user subscription data
    user.subscription.isActive = subscription.status === 'active';
    user.subscription.plan = plan;
    user.subscription.stripePriceId = priceId;
    user.subscription.currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    user.subscription.currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

    await user.save();
    console.log(`✅ User subscription updated: ${user._id}`);

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

    // Update user subscription status to inactive (removed)
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
      user.subscriptionStatus = 'inactive';
      user.stripeSubscriptionId = null;
      user.subscriptionType = null;
      user.stripePriceId = null;
      user.currentPeriodStart = null;
      user.currentPeriodEnd = null;
      user.cancelAtPeriodEnd = false;
      await user.save();
      console.log(`✅ User subscription status removed: ${user._id}`);
    }

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
      // Find user by Stripe subscription ID
      const user = await User.findOne({ stripeSubscriptionId: invoice.subscription });

      if (user) {
        // Update subscription status to active
        user.subscription.isActive = true;

        await user.save();
        console.log(`✅ Payment recorded for user subscription: ${user._id}`);

        // TODO: Send email confirmation to customer
        // sendPaymentSuccessEmail(user._id, invoice);
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
      // Find user by Stripe subscription ID
      const user = await User.findOne({ stripeSubscriptionId: invoice.subscription });

      if (user) {
        // Update subscription status to past_due
        user.subscriptionStatus = 'past_due';

        await user.save();
        console.log(`❌ User subscription marked as past_due: ${user._id}`);

        // TODO: Send payment failure notification to customer
        // sendPaymentFailureEmail(user._id, invoice);
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

/**
 * Handle checkout.session.completed event
 * Called when a checkout session is completed
 */
async function handleCheckoutSessionCompleted(session) {
  console.log(`✅ Checkout session completed: ${session.id}`);

  try {
    // Handle subscription checkout completion
    if (session.mode === 'subscription') {
      // Find user by Stripe customer ID
      const user = await User.findOne({ stripeCustomerId: session.customer });

      if (user) {
        // Update user with subscription info
        user.stripeSubscriptionId = session.subscription;
        user.subscription.isActive = true;
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
        await user.save();
        console.log(`✅ User subscription updated: ${user._id}`);
      }
    }

    // Handle one-time payment completion (program purchases)
    if (session.mode === 'payment') {
      // Check if this is a program purchase
      if (session.metadata && session.metadata.programId) {
        const programId = session.metadata.programId;
        const user = await User.findOne({ stripeCustomerId: session.customer });

        if (user) {
          // Check if program is already assigned to prevent duplicates
          const alreadyAssigned = user.assignedPrograms.some(ap => ap.programId.toString() === programId);

          if (!alreadyAssigned) {
            // Add program to user's assigned programs
            user.assignedPrograms.push({
              programId: programId,
              assignedAt: new Date()
            });

            await user.save();
            console.log(`✅ Program ${programId} assigned to user ${user._id}`);
          } else {
            console.log(`ℹ️ Program ${programId} already assigned to user ${user._id}`);
          }
        }
      }
    }

  } catch (error) {
    console.error(`Error handling checkout session completed event:`, error);
    throw error;
  }
}

module.exports = router;
