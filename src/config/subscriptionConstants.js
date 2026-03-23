
// DEPRECATED: PLAN_MAP replaced with stripeService.getPlanNameFromPriceId(priceId)
// const PLAN_MAP = {
//   [process.env.STRIPE_PRICE_1_MONTH]: '1-month',
//   [process.env.STRIPE_PRICE_3_MONTH]: '3-month',
//   [process.env.STRIPE_PRICE_6_MONTH]: '6-month',
//   [process.env.STRIPE_PRICE_12_MONTH]: '12-month',
// };


const ALLOWED_WEBHOOK_EVENTS = [
  'customer.created',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.created',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'checkout.session.completed'
];

module.exports = {
  ALLOWED_WEBHOOK_EVENTS
};
