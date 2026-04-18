const { logger } = require('../logger');

const { getStripe } = require('./client');

/**
 * Create or retrieve a Stripe customer
 * @param {string} email - Customer email
 * @param {string} paymentMethodId - Stripe Payment Method ID (optional)
 * @param {object} metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function createOrRetrieveCustomer(email, paymentMethodId = null, metadata = {}) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    // Check if customer already exists with this email in the current environment (test vs live).
    // Stripe's customer.list returns customers across both modes — filter by livemode so we don't
    // accidentally reuse a test customer in production or vice versa.
    const isLive = !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
    const allCustomers = await stripe.customers.list({ email, limit: 100 });
    const isApp = 'jefitness';
    const matchingCustomers = allCustomers.data.filter(c => c.livemode === isLive && c.metadata?.app === isApp);

    logger.debug('Customer search results', {
      email,
      isLive,
      total: allCustomers.data.length,
      matching: matchingCustomers.length,
      app: isApp
    });

    let customer;
    if (matchingCustomers.length > 0) {
      customer = matchingCustomers[0];
      // Always ensure app metadata
      const appMetadata = {
        ...customer.metadata,
        app: 'jefitness',
        ...(metadata.userId && { userId: metadata.userId }),
        source: 'jefitness_app'
      };
      customer = await stripe.customers.update(customer.id, { metadata: appMetadata });
      // Attach payment method if provided and not already attached
      if (paymentMethodId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
        } catch (attachError) {
          // Payment method might already be attached, ignore error
          logger.warn('Payment method attach warning', { error: attachError.message });
        }
      }
    } else {
      // Create new customer
      const appMetadata = {
        app: 'jefitness',
        ...(metadata.userId && { userId: metadata.userId }),
        source: 'jefitness_app',
        ...metadata
      };
      customer = await stripe.customers.create({
        email,
        ...(paymentMethodId && {
          payment_method: paymentMethodId,
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        }),
        metadata: appMetadata,
      });
      logger.info('Created new jefitness customer', { customerId: customer.id, email });
    }

    return customer;
  } catch (error) {
    throw new Error(`Failed to create/retrieve customer: ${error.message}`);
  }
}

/**
 * Create or get a Stripe customer for product purchases
 * @param {string} email - Customer email
 * @param {string} name - Customer name (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function getOrCreateProductCustomer(email, name = null) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Check if customer already exists — filter by livemode to avoid reusing test customers in production
    const isLive = !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 100,
    });
    const matchingCustomers = existingCustomers.data.filter(c => c.livemode === isLive && c.metadata?.app === 'jefitness');

    if (matchingCustomers.length > 0) {
      logger.debug('Found existing Stripe customer', {
        customerId: matchingCustomers[0].id,
      });
      return matchingCustomers[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      name: name || undefined,
      metadata: {
        source: 'jefitness_product_purchase',
      },
    });

    logger.info('Created new Stripe customer', { customerId: customer.id });
    return customer;
  } catch (error) {
    throw new Error(`Failed to get/create customer: ${error.message}`);
  }
}

module.exports = {
  createOrRetrieveCustomer,
  getOrCreateProductCustomer,
};
