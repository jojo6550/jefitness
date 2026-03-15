#!/usr/bin/env node
/**
 * Stripe Products & Prices Checker
 */

const { getStripe, getPlanPricing, PRODUCT_IDS } = require('../src/services/stripe');
require('dotenv').config();

async function checkProducts() {
  console.log('🔍 CHECKING STRIPE PRODUCTS & PRICES...\n');
  
  const stripe = getStripe();
  if (!stripe) {
    console.error('❌ STRIPE_SECRET_KEY missing!');
    return;
  }
  
  console.log('✅ Connected to Stripe');
  console.log('📦 Plans to check:', Object.keys(PRODUCT_IDS));
  
  for (const [plan, productId] of Object.entries(PRODUCT_IDS)) {
    console.log(`\n--- ${plan.toUpperCase()} ---`);
    console.log('Product ID:', productId);
    
    try {
      // Check product exists
      const product = await stripe.products.retrieve(productId);
      console.log('✅ Product exists:', product.name);
      
      // Check active recurring prices
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        type: 'recurring'
      });
      
      if (prices.data.length === 0) {
        console.error('❌ NO ACTIVE RECURRING PRICE!');
        console.log('💡 Fix: Stripe Dashboard → Products → Add Recurring Price');
      } else {
        console.log('✅ Active recurring price:', prices.data[0].id);
        console.log('   Amount:', `$${(prices.data[0].unit_amount/100).toFixed(2)}`);
      }
    } catch (error) {
      console.error('❌ Product not found:', error.message);
      console.log('💡 Fix: Create product in Stripe Dashboard');
    }
  }
}

checkProducts();

