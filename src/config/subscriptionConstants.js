const PLANS = {
  '1-month': {
    durationDays: 30,
    price: 115.00,
    priceJMD: 18000,
    currency: 'USD',
  },
  '3-month': {
    durationDays: 90,
    price: 230.00,
    priceJMD: 36000,
    currency: 'USD',
  },
  '6-month': {
    durationDays: 180,
    price: 459.00,
    priceJMD: 72000,
    currency: 'USD',
  },
  '12-month': {
    durationDays: 365,
    price: 765.00,
    priceJMD: 120000,
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
