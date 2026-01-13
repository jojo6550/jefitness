/**
 * Script to activate a user's subscription directly (bypasses webhooks)
 * Useful for testing or when webhooks aren't working
 *
 * Usage:
 *   node scripts/activate-subscription.js --email user@example.com --plan 1-month
 *   node scripts/activate-subscription.js --email user@example.com --plan free (to deactivate)
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const User = require('../src/models/User');

// Plan configuration with price IDs
const PLAN_CONFIG = {
  '1-month': {
    durationMonths: 1,
    priceId: process.env.STRIPE_PRICE_1_MONTH || 'price_1NfYT7GBrdnKY4igWvWr9x7q'
  },
  '3-month': {
    durationMonths: 3,
    priceId: process.env.STRIPE_PRICE_3_MONTH || 'price_1NfYT7GBrdnKY4igX2Ks1a8r'
  },
  '6-month': {
    durationMonths: 6,
    priceId: process.env.STRIPE_PRICE_6_MONTH || 'price_1NfYT7GBrdnKY4igY3Lt2b9s'
  },
  '12-month': {
    durationMonths: 12,
    priceId: process.env.STRIPE_PRICE_12_MONTH || 'price_1NfYT7GBrdnKY4igZ4Mu3c0t'
  }
};

const VALID_PLANS = ['free', ...Object.keys(PLAN_CONFIG)];

async function activateSubscription(email, plan) {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Validate plan
    if (!VALID_PLANS.includes(plan)) {
      console.error(`❌ Invalid plan: ${plan}`);
      console.log(`Valid plans: ${VALID_PLANS.join(', ')}`);
      process.exit(1);
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`Current subscription: ${user.subscription?.plan || 'none'}, isActive: ${user.subscription?.isActive || false}`);
    console.log(`\nActivating plan: ${plan}`);

    const now = new Date();
    const billingEnv = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';

    if (plan === 'free') {
      // Deactivate subscription - move to free tier
      user.subscription.isActive = false;
      user.subscription.plan = null;
      user.subscription.stripePriceId = null;
      user.subscription.stripeSubscriptionId = null;
      user.subscription.currentPeriodStart = null;
      user.subscription.currentPeriodEnd = null;
      user.stripeSubscriptionId = null;
      user.subscriptionStatus = 'free';
      user.cancelAtPeriodEnd = false;
      user.billingEnvironment = billingEnv;
      console.log('✅ User moved to free tier - subscription deactivated');
    } else {
      // Activate subscription for paid plan
      const config = PLAN_CONFIG[plan];
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + config.durationMonths);

      user.stripeSubscriptionId = `sub_manual_${Date.now()}`;
      user.subscriptionStatus = 'active';
      user.subscription.isActive = true;
      user.subscription.plan = plan;
      user.subscription.stripePriceId = config.priceId;
      user.subscription.stripeSubscriptionId = user.stripeSubscriptionId;
      user.subscription.currentPeriodStart = now;
      user.subscription.currentPeriodEnd = periodEnd;
      user.cancelAtPeriodEnd = false;
      user.billingEnvironment = billingEnv;

      console.log(`✅ Subscription activated for ${plan} plan`);
      console.log(`   Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);
      console.log(`   Price ID: ${config.priceId}`);
    }

    await user.save();

    // Verify with hasActiveSubscription method
    const hasActive = user.hasActiveSubscription();
    console.log(`\n📋 Subscription Status After Update:`);
    console.log(`   Plan: ${user.subscription.plan || 'none'}`);
    console.log(`   isActive: ${user.subscription.isActive}`);
    console.log(`   hasActiveSubscription(): ${hasActive}`);
    console.log(`   Period End: ${user.subscription.currentPeriodEnd?.toISOString() || 'N/A'}`);
    console.log(`   Status: ${user.subscriptionStatus}`);

    // Test API response format
    console.log(`\n📋 API Response Would Be:`);
    console.log(JSON.stringify({
      hasSubscription: plan !== 'free',
      status: plan === 'free' ? 'active' : 'active',
      isActive: plan !== 'free',
      hasActiveSubscription: hasActive,
      plan: user.subscription.plan || 'free'
    }, null, 2));

  } catch (error) {
    console.error('❌ Error activating subscription:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let email = null;
let plan = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--plan' && args[i + 1]) {
    plan = args[i + 1];
    i++;
  }
}

// Run
if (email && plan) {
  activateSubscription(email, plan);
} else {
  console.log(`
📋 Activate Subscription Script (Bypasses Webhooks)

Usage:
  node scripts/activate-subscription.js --email user@example.com --plan <plan>

Options:
  --email    User's email address (required)
  --plan     Plan to activate: free, 1-month, 3-month, 6-month, 12-month

Examples:
  # Activate 1-month subscription
  node scripts/activate-subscription.js --email john@example.com --plan 1-month

  # Move user to free tier
  node scripts/activate-subscription.js --email john@example.com --plan free

  # Activate 12-month subscription
  node scripts/activate-subscription.js --email john@example.com --plan 12-month

Note: This script directly updates the database, bypassing Stripe webhooks.
      The subscription will be immediately active without waiting for webhook delivery.
`);
  process.exit(1);
}

