#!/usr/bin/env node
const mongoose = require('mongoose');
const stripeService = require('../src/services/stripe');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const { PLAN_MAP } = require('../src/config/subscriptionConstants');
const logger = require('../src/services/logger').logger;

async function diagnoseSession(sessionId) {
  console.log(`🔍 Diagnosing session: ${sessionId}\n`);

  try {
    // 1. Test Stripe connection
    const stripe = stripeService.getStripe();
    if (!stripe) {
      throw new Error('❌ STRIPE_SECRET_KEY missing or invalid');
    }
    console.log('✅ Stripe connected');

    // 2. Get checkout session
    const session = await stripeService.getCheckoutSession(sessionId);
    console.log('\n📋 Session:', {
      id: session.id,
      mode: session.mode,
      payment_status: session.payment_status,
      customer: session.customer,
      subscription: session.subscription,
      amount_total: session.amount_total
    });

    if (session.payment_status !== 'paid' || session.mode !== 'subscription') {
      console.log('❌ Session not paid subscription');
      return;
    }

    // 3. Check subscription
    const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
    console.log('\n💳 Stripe Subscription:', {
      id: stripeSub.id,
      status: stripeSub.status,
      customer: stripeSub.customer,
      priceId: stripeSub.items.data[0]?.price?.id
    });

    const priceId = stripeSub.items.data[0]?.price?.id;
    const planLookup = PLAN_MAP[priceId];
    console.log('\n🔑 PLAN_MAP lookup:', {
      priceId,
      plan: planLookup || '❌ UNDEFINED',
      fallback: planLookup || 'unknown-plan'
    });

    // 4. Find user by customer
    const user = await User.findOne({ stripeCustomerId: session.customer }).lean();
    console.log('\n👤 User by customer:', user ? {
      id: user._id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId
    } : '❌ NO USER FOUND');

    // 5. Check existing Subscription
    const sub = await Subscription.findOne({ stripeSubscriptionId: session.subscription }).lean();
    console.log('\n📝 Existing Subscription:', sub ? '✅ FOUND' : '❌ MISSING');

    // 6. Test upsert would fail?
    console.log('\n🧪 Upsert payload plan validation:');
    const testPlan = PLAN_MAP[priceId] || 'unknown-plan';
    const validPlans = ['1-month', '3-month', '6-month', '12-month'];
    console.log(`plan: '${testPlan}' → ${validPlans.includes(testPlan) ? '✅ VALID' : '❌ INVALID'}`);

    console.log('\n✅ Diagnosis complete');
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
  }
}

// Usage
const sessionId = process.argv[2];
if (!sessionId) {
  console.log('Usage: node scripts/diagnose-session.js <SESSION_ID>');
  process.exit(1);
}

require('../config/db')
diagnoseSession(sessionId).catch(console.error).finally(() => process.exit(0))
  .catch(console.error);

