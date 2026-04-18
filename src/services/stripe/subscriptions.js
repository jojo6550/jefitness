const { logger } = require('../logger');

const { getStripe } = require('./client');
const { getPriceIdForPlan } = require('./pricing');

/**
 * Retrieve all subscriptions for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} status - Filter by status (all, active, past_due, canceled, unpaid, paused)
 * @returns {Promise<Array>} Array of subscription objects
 */
async function getCustomerSubscriptions(customerId, status = 'all') {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: status === 'all' ? undefined : status,
      expand: ['data.latest_invoice', 'data.default_payment_method'],
      limit: 100,
    });

    return subscriptions.data;
  } catch (error) {
    throw new Error(`Failed to retrieve subscriptions: ${error.message}`);
  }
}

/**
 * Get a single subscription by ID
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Stripe subscription object
 */
async function getSubscription(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent', 'default_payment_method'],
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to retrieve subscription: ${error.message}`);
  }
}

/**
 * Update a subscription (change plan, update payment method, etc.)
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {object} updates - Updates to apply { plan, priceId, paymentMethodId, etc. }
 * @returns {Promise<Object>} Updated subscription object
 */
async function updateSubscription(subscriptionId, updates = {}) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Prepare update object
    const updateData = {};

    // If plan is changing, update the price
    if (updates.plan) {
      const newPriceId = await getPriceIdForPlan(updates.plan);
      if (!newPriceId) {
        throw new Error(
          `No active recurring price found for plan: ${updates.plan} (check StripePlan DB)`
        );
      }

      // Update subscription items
      updateData.items = [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ];

      // Proration - charge or credit for the difference immediately
      updateData.proration_behavior = 'create_prorations';
    }

    // Update payment method if provided
    if (updates.paymentMethodId) {
      updateData.default_payment_method = updates.paymentMethodId;
    }

    // Update metadata if provided
    if (updates.metadata) {
      updateData.metadata = updates.metadata;
    }

    if (Object.keys(updateData).length === 0) {
      return subscription; // No updates to apply
    }

    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      updateData
    );

    return updatedSubscription;
  } catch (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {boolean} atPeriodEnd - If true, cancel at period end; if false, cancel immediately
 * @returns {Promise<Object>} Canceled subscription object
 */
async function cancelSubscription(subscriptionId, atPeriodEnd = false) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    if (atPeriodEnd) {
      // Cancel at period end
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return updatedSubscription;
    } else {
      // Cancel immediately
      const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
      return canceledSubscription;
    }
  } catch (error) {
    // Treat all "already gone" scenarios as success — cancelSubscription must be idempotent
    const msg = error.message || '';
    if (
      error.code === 'resource_missing' ||
      error.code === 'subscription_already_canceled' ||
      msg.includes('No such subscription') ||
      msg.includes('already canceled') ||
      msg.includes('already been canceled') ||
      msg.includes('Cannot cancel')
    ) {
      logger.info(
        'Stripe subscription already canceled or not found, treating as success',
        { subscriptionId }
      );
      return null;
    }
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
}

/**
 * Resume a subscription that was scheduled for cancellation
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Resumed subscription object
 */
async function resumeSubscription(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const resumedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return resumedSubscription;
  } catch (error) {
    throw new Error(`Failed to resume subscription: ${error.message}`);
  }
}

/**
 * Get all invoices for a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Array>} Array of invoice objects
 */
async function getSubscriptionInvoices(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
      expand: ['data.payment_intent'],
    });

    return invoices.data;
  } catch (error) {
    throw new Error(`Failed to retrieve invoices: ${error.message}`);
  }
}

module.exports = {
  getCustomerSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionInvoices,
};
