const { getPrimaryAppUrl } = require('../../config/security');
const { logger } = require('../logger');

const { getStripe } = require('./client');
const { getPlanPricing } = require('./pricing');

/**
 * Create a checkout session for subscription
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Subscription plan
 * @param {number} trialEndTimestamp - Unix seconds; when trial ends and billing starts (optional, null for immediate billing)
 * @param {object} metadata - Additional metadata to attach to the session (optional)
 * @returns {Promise<Object>} Checkout session object
 */
async function createCheckoutSession(
  customerId,
  plan,
  trialEndTimestamp = null,
  metadata = {}
) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // ✅ DEFENSIVE: Validate customer exists before checkout
    if (!customerId) {
      throw new Error('Missing customer ID - please re-authenticate your account');
    }
    logger.debug('Validating Stripe customer', { customerId, plan });

    try {
      await stripe.customers.retrieve(customerId);
      logger.debug('Stripe customer verified', { customerId });
    } catch (custErr) {
      if (custErr.code === 'resource_missing') {
        logger.error('Stripe customer not found', { customerId });
        throw new Error(
          `Customer account invalid: ${customerId}. Please contact support to re-link your Stripe account.`
        );
      }
      logger.error('Customer validation failed', { customerId, error: custErr.message });
      throw custErr;
    }

    // Dynamic price lookup from cached plans (matches frontend getPlans)
    const pricing = await getPlanPricing();
    const planData = pricing[plan];
    if (!planData?.priceId) {
      const available = Object.keys(pricing);
      throw new Error(
        `No active price found for plan "${plan}". ` +
          `Available: ${available.length ? available.join(', ') : 'none'}. ` +
          'Run "node scripts/sync-stripe-to-db.js" to sync Stripe → DB'
      );
    }
    const priceId = planData.priceId;
    logger.debug('Checkout price resolved', {
      plan,
      priceIdSuffix: priceId.slice(-8),
      currency: planData.currency,
    });

    const sessionParams = {
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${getPrimaryAppUrl()}/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getPrimaryAppUrl()}/subscriptions?cancelled=true`,
      metadata: {
        plan: plan,
        priceId: priceId.slice(-8),
        source: 'subscription_checkout',
        ...metadata,
      },
      // Allow customer to update payment method
      billing_address_collection: 'required',
      // Removed: subscription_data.proration_behavior - invalid for new sessions without billing_cycle_anchor
    };

    // If trial_end provided, set it on subscription_data
    if (trialEndTimestamp) {
      sessionParams.subscription_data = {
        trial_end: trialEndTimestamp,
        metadata: {
          ...metadata,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logger.info('Subscription checkout session created', {
      sessionId: session.id,
      customerId,
      trialEnd: trialEndTimestamp,
    });
    return session;
  } catch (error) {
    logger.error('createCheckoutSession error', {
      plan,
      customerId,
      error: error.message,
    });
    throw new Error(`Failed to create checkout session: ${error.message}`);
  }
}

/**
 * Create a Stripe Checkout session for a queued subscription.
 * The subscription will not charge until trialEndTimestamp (= current sub's period end).
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Plan name like '1-month', '6-month'
 * @param {number} trialEndTimestamp - Unix seconds; when the trial (free period) ends and billing starts
 * @param {string} successUrl - Redirect on success
 * @param {string} cancelUrl - Redirect on cancel
 */
async function createQueuedCheckoutSession(
  customerId,
  plan,
  trialEndTimestamp,
  successUrl,
  cancelUrl
) {
  try {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe not initialized');
    if (!customerId) throw new Error('Missing customer ID');

    await stripe.customers.retrieve(customerId).catch(err => {
      if (err.code === 'resource_missing')
        throw new Error(`Customer account invalid: ${customerId}`);
      throw err;
    });

    const pricing = await getPlanPricing();
    const planData = pricing[plan];
    if (!planData?.priceId) {
      throw new Error(`No active price found for plan "${plan}"`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: planData.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_end: trialEndTimestamp,
        metadata: { is_queued: 'true', plan },
      },
      metadata: { plan, is_queued: 'true', source: 'queued_checkout' },
      billing_address_collection: 'required',
    });

    logger.info('Queued subscription checkout session created', {
      sessionId: session.id,
      customerId,
      plan,
      trialEnd: trialEndTimestamp,
    });
    return session;
  } catch (error) {
    logger.error('createQueuedCheckoutSession error', {
      plan,
      customerId,
      error: error.message,
    });
    throw new Error(`Failed to create queued checkout session: ${error.message}`);
  }
}

/**
 * Verify and retrieve a checkout session
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<Object>} Checkout session object
 */
async function getCheckoutSession(sessionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });

    return session;
  } catch (error) {
    throw new Error(`Failed to retrieve checkout session: ${error.message}`);
  }
}

module.exports = {
  createCheckoutSession,
  createQueuedCheckoutSession,
  getCheckoutSession,
};
