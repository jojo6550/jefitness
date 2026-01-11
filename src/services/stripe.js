const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * STRIPE PRICE IDS CONFIGURATION
 * Replace these with your actual Stripe Price IDs from the dashboard
 * You can find them at: https://dashboard.stripe.com/test/products
 */
const PRICE_IDS = {
  '1-month': process.env.STRIPE_PRICE_1_MONTH || 'price_1NfYT7GBrdnKY4igWvWr9x7q', // Replace with actual Price ID
  '3-month': process.env.STRIPE_PRICE_3_MONTH || 'price_1NfYT7GBrdnKY4igX2Ks1a8r',
  '6-month': process.env.STRIPE_PRICE_6_MONTH || 'price_1NfYT7GBrdnKY4igY3Lt2b9s',
  '12-month': process.env.STRIPE_PRICE_12_MONTH || 'price_1NfYT7GBrdnKY4igZ4Mu3c0t'
};

/**
 * PLAN PRICING (for frontend display)
 * Update these with your actual pricing
 */
const PLAN_PRICING = {
  '1-month': {
    amount: 999, // in cents ($9.99)
    displayPrice: '$9.99',
    duration: '1 Month'
  },
  '3-month': {
    amount: 2799, // in cents ($27.99)
    displayPrice: '$27.99',
    duration: '3 Months',
    savings: '$2.98' // shows savings vs 1-month plan
  },
  '6-month': {
    amount: 4999, // in cents ($49.99)
    displayPrice: '$49.99',
    duration: '6 Months',
    savings: '$9.95'
  },
  '12-month': {
    amount: 8999, // in cents ($89.99)
    displayPrice: '$89.99',
    duration: '12 Months',
    savings: '$29.89'
  }
};

/**
 * Create or retrieve a Stripe customer
 * @param {string} email - Customer email
 * @param {string} paymentMethodId - Stripe Payment Method ID (optional)
 * @param {object} metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function createOrRetrieveCustomer(email, paymentMethodId = null, metadata = {}) {
  try {
    // Check if customer already exists with this email
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        customer = await stripe.customers.update(customer.id, { metadata });
      }
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        email: email,
        ...(paymentMethodId && {
          payment_method: paymentMethodId,
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        }),
        metadata: metadata
      });
    }

    return customer;
  } catch (error) {
    throw new Error(`Failed to create/retrieve customer: ${error.message}`);
  }
}

/**
 * Create a subscription for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Subscription plan ('1-month', '3-month', '6-month', '12-month')
 * @returns {Promise<Object>} Stripe subscription object
 */
async function createSubscription(customerId, plan) {
  try {
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price: priceId
      }],
      // Expand to get latest invoice and payment intent details
      expand: ['latest_invoice.payment_intent'],
      // Allow incomplete payment - customer can complete it later
      payment_behavior: 'allow_incomplete'
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
}

/**
 * Retrieve all subscriptions for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} status - Filter by status (all, active, past_due, canceled, unpaid, paused)
 * @returns {Promise<Array>} Array of subscription objects
 */
async function getCustomerSubscriptions(customerId, status = 'all') {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: status === 'all' ? undefined : status,
      expand: ['data.latest_invoice', 'data.default_payment_method'],
      limit: 100
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
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent', 'default_payment_method']
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
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Prepare update object
    const updateData = {};

    // If plan is changing, update the price
    if (updates.plan) {
      const newPriceId = PRICE_IDS[updates.plan];
      if (!newPriceId) {
        throw new Error(`Invalid plan: ${updates.plan}`);
      }
      
      // Update subscription items
      updateData.items = [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }];
      
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
    const cancelData = atPeriodEnd 
      ? { cancel_at_period_end: true } // Graceful cancellation
      : {}; // Immediate cancellation

    const canceledSubscription = await stripe.subscriptions.update(
      subscriptionId,
      cancelData
    );

    // If not at period end, actually delete the subscription
    if (!atPeriodEnd) {
      return await stripe.subscriptions.del(subscriptionId);
    }

    return canceledSubscription;
  } catch (error) {
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
    const resumedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false }
    );

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
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
      expand: ['data.payment_intent']
    });

    return invoices.data;
  } catch (error) {
    throw new Error(`Failed to retrieve invoices: ${error.message}`);
  }
}

/**
 * Create a checkout session for subscription
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Subscription plan
 * @param {string} successUrl - URL to redirect on successful payment
 * @param {string} cancelUrl - URL to redirect if payment is canceled
 * @returns {Promise<Object>} Checkout session object
 */
async function createCheckoutSession(customerId, plan, successUrl, cancelUrl) {
  try {
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Allow customer to update payment method
      billing_address_collection: 'required',
      subscription_data: {
        // Automatically apply proration for existing subscriptions
        proration_behavior: 'create_prorations'
      }
    });

    return session;
  } catch (error) {
    throw new Error(`Failed to create checkout session: ${error.message}`);
  }
}

/**
 * Get payment methods for a customer
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} Array of payment method objects
 */
async function getPaymentMethods(customerId) {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100
    });

    return paymentMethods.data;
  } catch (error) {
    throw new Error(`Failed to retrieve payment methods: ${error.message}`);
  }
}

/**
 * Delete a payment method
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Deleted payment method object
 */
async function deletePaymentMethod(paymentMethodId) {
  try {
    const deletedPaymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
    return deletedPaymentMethod;
  } catch (error) {
    throw new Error(`Failed to delete payment method: ${error.message}`);
  }
}

/**
 * Create a payment intent for manual payment processing
 * @param {string} customerId - Stripe customer ID
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (e.g., 'usd')
 * @returns {Promise<Object>} Payment intent object
 */
async function createPaymentIntent(customerId, amount, currency = 'usd') {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method_types: ['card']
    });

    return paymentIntent;
  } catch (error) {
    throw new Error(`Failed to create payment intent: ${error.message}`);
  }
}

module.exports = {
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionInvoices,
  createCheckoutSession,
  getPaymentMethods,
  deletePaymentMethod,
  createPaymentIntent,
  PRICE_IDS,
  PLAN_PRICING
};
