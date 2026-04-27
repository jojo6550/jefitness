const PLANS = {
  '1-month': {
    durationDays: 30,
    price: 9.99,
    currency: 'USD',
  },
  '3-month': {
    durationDays: 90,
    price: 24.99,
    currency: 'USD',
  },
  '6-month': {
    durationDays: 180,
    price: 44.99,
    currency: 'USD',
  },
  '12-month': {
    durationDays: 365,
    price: 79.99,
    currency: 'USD',
  },
};

const ALLOWED_WEBHOOK_EVENTS = [
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.DENIED',
  'PAYMENT.SALE.REFUNDED',
];

module.exports = {
  PLANS,
  ALLOWED_WEBHOOK_EVENTS,
};
