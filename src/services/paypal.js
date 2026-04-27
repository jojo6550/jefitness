const { getPaypalClient, verifyWebhookSignature } = require('./paypal/client');
const checkout = require('./paypal/checkout');

module.exports = {
  getPaypalClient,
  verifyWebhookSignature,
  createPaymentLink: checkout.createPaymentLink,
  capturePayment: checkout.capturePayment,
  getOrderDetails: checkout.getOrderDetails,
};
