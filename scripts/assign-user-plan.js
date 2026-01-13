/**
 * Script to assign or change user subscription plans/tiers
 * 
 * Usage:
 *   node scripts/assign-user-plan.js --email user@example.com --plan 1-month
 *   node scripts/assign-user-plan.js --email user@example.com --plan free
 *   node scripts/assign-user-plan.js --list-users
 * 
 * Options:
 *   --email     User's email address (required unless --list-users)
 *   --plan      Plan to assign: free, 1-month, 3-month, 6-month, 12-month
 *   --list-users List all users with their current subscription status
 *   --set-expired Set currentPeriodEnd to now (for testing expired subscriptions)
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const User = require('../src/models/User');

// Plan pricing (for reference)
const PLAN_PRICING = {
  'free': 0,
  '1-month': 29.99,
  '3-month': 79.99,
  '6-month': 149.99,
  '12-month': 279.99
};

const VALID_PLANS = Object.keys(PLAN_PRICING);

async function listUsers() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const users = await User.find({}, 'email firstName lastName subscription.isActive subscription.plan stripeSubscriptionId currentPeriodEnd')
      .sort({ createdAt: -1 })
      .limit(50);

    console.log('📋 Users with subscription status (showing top 50):\n');
    console.log('Email'.padEnd(35) + ' | Plan'.padEnd(12) + ' | Active | Stripe Sub ID');
    console.log('-'.repeat(70));

    for (const user of users) {
      const email = user.email.padEnd(35);
      const plan = (user.subscription?.plan || 'none').padEnd(12);
      const active = user.subscription?.isActive ? '✅' : '❌';
      const stripeSub = user.stripeSubscriptionId ? user.stripeSubscriptionId.substring(0, 15) + '...' : 'N/A';
      console.log(`${email} | ${plan} | ${active} | ${stripeSub}`);
    }

    console.log(`\nTotal users shown: ${users.length}`);
    console.log(`\nValid plans: ${VALID_PLANS.join(', ')}`);

  } catch (error) {
    console.error('❌ Error listing users:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

async function assignPlan(email, plan, options = {}) {
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
    console.log(`\nAssigning to plan: ${plan}`);

    // Calculate subscription period
    const now = new Date();
    let periodEnd;

    switch (plan) {
      case 'free':
        user.subscription.isActive = false;
        user.subscription.plan = null;
        user.subscription.stripePriceId = null;
        user.subscription.stripeSubscriptionId = null;
        user.subscription.currentPeriodStart = null;
        user.subscription.currentPeriodEnd = null;
        user.stripeSubscriptionId = null;
        user.subscriptionStatus = 'free';
        console.log('✅ User moved to free tier - subscription deactivated');
        break;

      case '1-month':
        periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        user.subscription.isActive = true;
        user.subscription.plan = '1-month';
        user.subscription.stripePriceId = process.env.STRIPE_PRICE_1_MONTH || 'price_1month';
        user.subscription.stripeSubscriptionId = `sub_manual_${Date.now()}`;
        user.subscription.currentPeriodStart = now;
        user.subscription.currentPeriodEnd = periodEnd;
        user.stripeSubscriptionId = user.subscription.stripeSubscriptionId;
        user.subscriptionStatus = 'active';
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
        console.log(`✅ User assigned to 1-month plan`);
        console.log(`   Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);
        break;

      case '3-month':
        periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 3);
        user.subscription.isActive = true;
        user.subscription.plan = '3-month';
        user.subscription.stripePriceId = process.env.STRIPE_PRICE_3_MONTH || 'price_3month';
        user.subscription.stripeSubscriptionId = `sub_manual_${Date.now()}`;
        user.subscription.currentPeriodStart = now;
        user.subscription.currentPeriodEnd = periodEnd;
        user.stripeSubscriptionId = user.subscription.stripeSubscriptionId;
        user.subscriptionStatus = 'active';
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
        console.log(`✅ User assigned to 3-month plan`);
        console.log(`   Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);
        break;

      case '6-month':
        periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 6);
        user.subscription.isActive = true;
        user.subscription.plan = '6-month';
        user.subscription.stripePriceId = process.env.STRIPE_PRICE_6_MONTH || 'price_6month';
        user.subscription.stripeSubscriptionId = `sub_manual_${Date.now()}`;
        user.subscription.currentPeriodStart = now;
        user.subscription.currentPeriodEnd = periodEnd;
        user.stripeSubscriptionId = user.subscription.stripeSubscriptionId;
        user.subscriptionStatus = 'active';
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
        console.log(`✅ User assigned to 6-month plan`);
        console.log(`   Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);
        break;

      case '12-month':
        periodEnd = new Date(now);
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        user.subscription.isActive = true;
        user.subscription.plan = '12-month';
        user.subscription.stripePriceId = process.env.STRIPE_PRICE_12_MONTH || 'price_12month';
        user.subscription.stripeSubscriptionId = `sub_manual_${Date.now()}`;
        user.subscription.currentPeriodStart = now;
        user.subscription.currentPeriodEnd = periodEnd;
        user.stripeSubscriptionId = user.subscription.stripeSubscriptionId;
        user.subscriptionStatus = 'active';
        user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
        console.log(`✅ User assigned to 12-month plan`);
        console.log(`   Period: ${now.toISOString()} to ${periodEnd.toISOString()}`);
        break;
    }

    await user.save();
    console.log(`\n📋 Updated subscription status:`);
    console.log(`   Plan: ${user.subscription.plan || 'none'}`);
    console.log(`   isActive: ${user.subscription.isActive}`);
    console.log(`   Period End: ${user.subscription.currentPeriodEnd?.toISOString() || 'N/A'}`);

  } catch (error) {
    console.error('❌ Error assigning plan:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

async function setExpired(email) {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    // Set period end to past date (expired subscription)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    user.subscription.currentPeriodEnd = pastDate;
    await user.save();

    console.log(`✅ Set subscription as expired for: ${user.email}`);
    console.log(`   Period End: ${pastDate.toISOString()}`);

  } catch (error) {
    console.error('❌ Error setting expired:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  email: null,
  plan: null,
  listUsers: args.includes('--list-users'),
  setExpired: args.includes('--set-expired')
};

// Extract values
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) {
    options.email = args[i + 1];
    i++;
  } else if (args[i] === '--plan' && args[i + 1]) {
    options.plan = args[i + 1];
    i++;
  }
}

// Run command
if (options.listUsers) {
  listUsers();
} else if (options.email && options.plan) {
  if (options.setExpired) {
    setExpired(options.email);
  } else {
    assignPlan(options.email, options.plan, options);
  }
} else {
  console.log(`
📋 User Subscription Plan Manager

Usage:
  node scripts/assign-user-plan.js --email user@example.com --plan <plan>
  node scripts/assign-user-plan.js --list-users
  node scripts/assign-user-plan.js --email user@example.com --set-expired

Options:
  --email          User's email address (required)
  --plan           Plan to assign: free, 1-month, 3-month, 6-month, 12-month
  --list-users     List all users with their current subscription status
  --set-expired    Set subscription period end to yesterday (for testing)

Examples:
  # Assign user to 1-month plan
  node scripts/assign-user-plan.js --email john@example.com --plan 1-month

  # Move user to free tier
  node scripts/assign-user-plan.js --email john@example.com --plan free

  # List all users
  node scripts/assign-user-plan.js --list-users

  # Test expired subscription
  node scripts/assign-user-plan.js --email john@example.com --set-expired
`);
  process.exit(1);
}

