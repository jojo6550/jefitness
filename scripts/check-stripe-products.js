#!/usr/bin/env node

/**
 * Check Stripe Products Script
 *
 * This script checks the current Stripe products and their prices
 * to help debug subscription creation issues.
 */

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { getAllProducts, getAllActivePrices } = require('../src/services/stripe');

async function checkStripeProducts() {
  try {
    console.log('🔍 Checking Stripe products...\n');

    // Get all products
    const products = await getAllProducts();
    console.log(`📦 Found ${products.length} products:`);

    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.id})`);
      console.log(`   Active: ${product.active}`);
      console.log(`   Prices: ${product.prices.length}`);

      product.prices.forEach(price => {
        console.log(`   - ${price.id}: $${(price.amount / 100).toFixed(2)} ${price.currency} (${price.type})`);
        if (price.recurring) {
          console.log(`     Recurring: ${price.recurring.interval_count} ${price.recurring.interval}`);
        }
      });
      console.log('');
    });

    // Get all active prices
    const prices = await getAllActivePrices();
    console.log(`💰 Found ${prices.length} active recurring prices:`);

    prices.forEach((price, index) => {
      console.log(`${index + 1}. ${price.productName} - $${price.amount} (${price.interval})`);
      console.log(`   Product ID: ${price.productId}`);
      console.log(`   Price ID: ${price.priceId}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error checking Stripe products:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  checkStripeProducts();
}

module.exports = { checkStripeProducts };
