const { getStripe } = require('./stripe/client');
const pricing = require('./stripe/pricing');
const customers = require('./stripe/customers');
const subscriptions = require('./stripe/subscriptions');
const payments = require('./stripe/payments');
const checkout = require('./stripe/checkout');
const products = require('./stripe/products');

module.exports = {
  getStripe,
  createOrRetrieveCustomer: customers.createOrRetrieveCustomer,
  getCustomerSubscriptions: subscriptions.getCustomerSubscriptions,
  getSubscription: subscriptions.getSubscription,
  updateSubscription: subscriptions.updateSubscription,
  cancelSubscription: subscriptions.cancelSubscription,
  resumeSubscription: subscriptions.resumeSubscription,
  getSubscriptionInvoices: subscriptions.getSubscriptionInvoices,
  createCheckoutSession: checkout.createCheckoutSession,
  createQueuedCheckoutSession: checkout.createQueuedCheckoutSession,

  getCheckoutSession: checkout.getCheckoutSession,
  getOrCreateProductCustomer: customers.getOrCreateProductCustomer,
  getPaymentMethods: payments.getPaymentMethods,
  deletePaymentMethod: payments.deletePaymentMethod,
  createPaymentIntent: payments.createPaymentIntent,
  getPriceIdForProduct: pricing.getPriceIdForProduct,
  getPriceIdForPlan: pricing.getPriceIdForPlan,
  getPlanNameFromPriceId: pricing.getPlanNameFromPriceId,
  getPlanPricing: pricing.getPlanPricing,
  getAllActivePrices: pricing.getAllActivePrices,
  getAllProducts: products.getAllProducts,
  getProduct: products.getProduct,
  getProductPrice: products.getProductPrice,
  formatProductForFrontend: products.formatProductForFrontend,
  formatProductsForFrontend: products.formatProductsForFrontend,
};
