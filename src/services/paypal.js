const { getPaypalClient } = require('./paypal/client');
const checkout = require('./paypal/checkout');

module.exports = {
  getPaypalClient,
  createPaymentLink: checkout.createPaymentLink,
  capturePayment: checkout.capturePayment,
  getOrderDetails: checkout.getOrderDetails,
};
