#!/usr/bin/env node
/**
 * Enhanced Diagnostic Script for Subscriptions Checkout
 * Tests the exact failing endpoint + Stripe connectivity
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { getStripe, PRODUCT_IDS } = require('../src/services/stripe');
const User = require('../src/models/User');
require('dotenv').config();

const API_BASE = process.env.API_BASE || 'http://localhost:10000';

async function testCheckout() {
  console.log('🔍 TESTING CHECKOUT ENDPOINT...\n');
  
  try {
    // 1. Check Stripe connectivity
    const stripe = getStripe();
    console.log('✅ Stripe initialized:', !!stripe);
    console.log('📋 Environment:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'LIVE');
    
    // 2. Check PRODUCT_IDS config
    console.log('📦 PRODUCT_IDS:', PRODUCT_IDS);
    if (!PRODUCT_IDS['1-month']) {
      console.error('❌ MISSING STRIPE_PRODUCT_1_MONTH env var!');
      return;
    }
    
    // 3. Create test user or get existing
    await mongoose.connect(process.env.MONGODB_URI);
    let user = await User.findOne({ email: 'test@checkout.local' });
    if (!user) {
      user = new User({
        email: 'test@checkout.local',
        firstName: 'Test',
        lastName: 'Checkout',
        password: 'testpass123'
      });
      await user.save();
      console.log('👤 Created test user:', user._id);
    }
    
    // 4. Get auth token (simplified for test)
    const loginRes = await axios.post(`${API_BASE}/api/v1/auth/login`, {
      email: user.email,
      password: 'testpass123'
    });
    const token = loginRes.data.data.token;
    console.log('🔑 Got test token');
    
    // 5. Test checkout endpoint
    console.log('🧪 POST /api/v1/subscriptions/checkout');
    const checkoutRes = await axios.post(
      `${API_BASE}/api/v1/subscriptions/checkout`,
      { planId: '1-month' },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('✅ CHECKOUT SUCCESS:', checkoutRes.data);
    
  } catch (error) {
    console.error('❌ CHECKOUT FAILED:', error.response?.data || error.message);
    
    // Detailed Stripe diagnosis
    if (error.response?.status === 500) {
      console.log('\n🔍 STRIPE DIAGNOSIS:');
      console.log('1. Check .env has STRIPE_PRODUCT_1_MONTH=prod_xxxxx');
      console.log('2. Stripe Dashboard → Products → Verify active RECURRING price');
      console.log('3. Test product ID:', PRODUCT_IDS['1-month']);
    }
  } finally {
    mongoose.disconnect();
  }
}

if (process.argv.includes('checkout')) {
  testCheckout();
} else {
  console.log('Usage: node scripts/diagnose-subscriptions.js checkout');
}

