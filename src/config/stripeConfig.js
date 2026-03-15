/**
 * Stripe Configuration
 * Centralized location for all Stripe Product and Price IDs
 */

const stripeConfig = {
  // Subscription Plans
  PRODUCT_IDS: {
    '1-month': process.env.STRIPE_PRODUCT_1_MONTH || 'prod_TlkNETGd6OFrRf',
    '3-month': process.env.STRIPE_PRODUCT_3_MONTH || 'prod_TlkOMtyHdhvBXQ',
    '6-month': process.env.STRIPE_PRODUCT_6_MONTH || 'prod_TlkQ5HrbgnHXA5',
    '12-month': process.env.STRIPE_PRODUCT_12_MONTH || 'prod_TlkRUlSilrQIu0'
  },

  // One-time Product Purchases
  PRODUCT_MAP: {
    'seamoss-small': {
      productId: process.env.STRIPE_PRODUCT_SEAMOSS_SMALL,
      priceId: process.env.STRIPE_PRICE_SEAMOSS_SMALL,
      name: 'Seamoss - Small Size'
    },
    'seamoss-large': {
      productId: process.env.STRIPE_PRODUCT_SEAMOSS_LARGE,
      priceId: process.env.STRIPE_PRICE_SEAMOSS_LARGE,
      name: 'Seamoss - Large Size'
    },
    'coconut-water': {
      productId: process.env.STRIPE_PRODUCT_COCONUT_WATER,
      priceId: process.env.STRIPE_PRICE_COCONUT_WATER,
      name: 'Coconut Water'
    },
    'coconut-jelly': {
      productId: process.env.STRIPE_PRODUCT_COCONUT_JELLY,
      priceId: process.env.STRIPE_PRICE_COCONUT_JELLY,
      name: 'Coconut Jelly'
    }
  },

  // Program Products (Legacy/Specific)
  PROGRAM_PRODUCT_IDS: {
    // Add specific program slug to product ID mappings here if needed
  },

  // Webhook Configuration
  WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  
  // Environment Helper
  isTestEnvironment: () => process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || process.env.NODE_ENV !== 'production'
};

module.exports = stripeConfig;
