const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  '1-month': 'prod_TlkNETGd6OFrRf',
  '3-month': 'prod_TlkOMtyHdhvBXQ',
  '6-month': 'prod_TlkQ5HrbgnHXA5',
  '12-month': 'prod_TlkRUlSilrQIu0'
};

/**
 * Create or retrieve a Stripe customer
 * @param {string} email - Customer email
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} Stripe customer object
 */
async function createOrRetrieveCustomer(email, paymentMethodId) {
  try {
    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        email: email,
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
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
      expand: ['latest_invoice.payment_intent']
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
}

/**
 * Retrieve all subscriptions for a customer
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} Array of subscription objects
 */
async function getCustomerSubscriptions(customerId) {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.latest_invoice']
    });

    return subscriptions.data;
  } catch (error) {
    throw new Error(`Failed to retrieve subscriptions: ${error.message}`);
  }
}

module.exports = {
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  PRICE_IDS
};
