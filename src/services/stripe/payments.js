const { getStripe } = require('./client');

/**
 * Get payment methods for a customer
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} Array of payment method objects
 */
async function getPaymentMethods(customerId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
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
    const deletedPaymentMethod = await getStripe().paymentMethods.detach(paymentMethodId);
    return deletedPaymentMethod;
  } catch (error) {
    throw new Error(`Failed to delete payment method: ${error.message}`);
  }
}

/**
 * Create a payment intent for manual payment processing
 * @param {string} customerId - Stripe customer ID
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (e.g., 'jmd')
 * @returns {Promise<Object>} Payment intent object
 */
async function createPaymentIntent(customerId, amount, currency = 'jmd') {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method_types: ['card'],
    });

    return paymentIntent;
  } catch (error) {
    throw new Error(`Failed to create payment intent: ${error.message}`);
  }
}

module.exports = {
  getPaymentMethods,
  deletePaymentMethod,
  createPaymentIntent,
};
