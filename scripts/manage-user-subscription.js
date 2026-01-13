#!/usr/bin/env node

/**
 * Manage User Subscription Script
 *
 * This script manages user subscriptions by either creating new subscriptions
 * for users without active subscriptions or changing plans for existing ones.
 * Run with: node scripts/manage-user-subscription.js <email> <plan>
 */

const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models and services
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const { createOrRetrieveCustomer, createSubscription, updateSubscription, cancelSubscription } = require('../src/services/stripe');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/jefitness';
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      family: 4
    });
    console.log('✅ Connected to database');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Make sure MongoDB is running and MONGO_URI is set in your .env file');
    process.exit(1);
  }
}

async function findUser(email) {
  return await User.findOne({ email: email.toLowerCase() });
}

async function displayMenu(currentPlan) {
  console.log('\n📋 Available Plans:');
  console.log('==================');

  const plans = [
    { key: 'free', name: 'Free', description: 'Basic access' },
    { key: '1-month', name: '1 Month', description: 'Monthly subscription' },
    { key: '3-month', name: '3 Month', description: 'Quarterly subscription' },
    { key: '6-month', name: '6 Month', description: 'Semi-annual subscription' },
    { key: '12-month', name: '12 Month', description: 'Annual subscription' }
  ];

  plans.forEach((plan, index) => {
    const marker = plan.key === currentPlan ? '→' : ' ';
    console.log(`${index + 1}. ${marker} ${plan.name} - ${plan.description}`);
  });

  console.log('\n==================');
  return plans;
}

async function createStripeSubscription(user, plan) {
  try {
    console.log('🔄 Creating Stripe customer...');

    // Create or retrieve Stripe customer
    const customer = await createOrRetrieveCustomer(user.email, null, {
      userId: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName
    });

    console.log('✅ Stripe customer created/retrieved:', customer.id);

    // Update user with customer ID
    user.stripeCustomerId = customer.id;
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
    await user.save();

    console.log('🔄 Creating subscription...');

    // Create subscription
    const subscription = await createSubscription(customer.id, plan);

    console.log('✅ Subscription created:', subscription.id);

    // Update user record with subscription info
    user.stripeSubscriptionId = subscription.id;
    user.subscription.isActive = subscription.status === 'active';
    user.subscription.plan = plan;
    user.subscription.stripePriceId = subscription.items.data[0]?.price.id;
    user.subscription.stripeSubscriptionId = subscription.id;
    user.subscription.currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    user.subscription.currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

    await user.save();

    // Create subscription record in database
    const currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date();
    const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

    // Validate currency - default to 'usd' if not supported
    const allowedCurrencies = ['usd', 'eur', 'gbp'];
    const stripeCurrency = subscription.items.data[0]?.price.currency || 'usd';
    const currency = allowedCurrencies.includes(stripeCurrency.toLowerCase()) ? stripeCurrency.toLowerCase() : 'usd';

    const subscriptionRecord = new Subscription({
      userId: user._id,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      plan: plan,
      stripePriceId: subscription.items.data[0]?.price.id,
      currentPeriodStart: currentPeriodStart,
      currentPeriodEnd: currentPeriodEnd,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      amount: subscription.items.data[0]?.price.unit_amount || 0, // Amount in cents
      currency: currency,
      billingEnvironment: user.billingEnvironment
    });

    await subscriptionRecord.save();

    console.log('✅ Database records updated');

    return { subscription, customer };

  } catch (error) {
    console.error('❌ Failed to create subscription:', error.message);
    throw error;
  }
}

async function changeUserPlan(user, selectedPlan) {
  console.log('\n🔄 Updating subscription...');

  if (selectedPlan.key === 'free') {
    // Cancel subscription for free tier
    if (user.stripeSubscriptionId) {
      try {
        await cancelSubscription(user.stripeSubscriptionId, true); // Cancel at period end
        console.log('✅ Stripe subscription cancelled (will end at period end)');
      } catch (stripeError) {
        console.error('❌ Stripe cancellation failed:', stripeError.message);
      }
    }

    // Update user to free tier
    user.subscription.isActive = false;
    user.subscription.plan = null;
    user.subscription.stripePriceId = null;
    user.subscription.stripeSubscriptionId = null;
    user.subscription.currentPeriodStart = null;
    user.subscription.currentPeriodEnd = null;
    user.stripeSubscriptionId = null;

    await user.save();
    console.log('✅ User updated to free tier');

  } else {
    // Paid plan - update existing subscription
    try {
      const updatedSubscription = await updateSubscription(user.stripeSubscriptionId, {
        plan: selectedPlan.key
      });

      console.log('✅ Stripe subscription updated successfully');

      // Update user record
      user.subscriptionType = selectedPlan.key;
      user.subscriptionStatus = updatedSubscription.status;
      user.stripePriceId = updatedSubscription.items.data[0]?.price.id;
      user.currentPeriodStart = updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : null;
      user.currentPeriodEnd = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null;
      user.cancelAtPeriodEnd = updatedSubscription.cancel_at_period_end || false;

      await user.save();

      // Update subscription record if exists
      const subscriptionRecord = await Subscription.findOne({
        stripeSubscriptionId: user.stripeSubscriptionId,
        userId: user._id
      });

      if (subscriptionRecord) {
        subscriptionRecord.plan = selectedPlan.key;
        subscriptionRecord.status = updatedSubscription.status;
        subscriptionRecord.stripePriceId = updatedSubscription.items.data[0]?.price.id;
        subscriptionRecord.currentPeriodStart = updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : new Date();
        subscriptionRecord.currentPeriodEnd = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now
        subscriptionRecord.cancelAtPeriodEnd = updatedSubscription.cancel_at_period_end || false;
        subscriptionRecord.amount = updatedSubscription.items.data[0]?.price.unit_amount || subscriptionRecord.amount;
        subscriptionRecord.currency = updatedSubscription.items.data[0]?.price.currency || subscriptionRecord.currency;
        subscriptionRecord.updatedAt = new Date();

        await subscriptionRecord.save();
        console.log('✅ Database subscription record updated');
      }

      console.log('\n🎉 Plan change completed successfully!');
      console.log(`📊 New plan: ${selectedPlan.name}`);
      console.log(`📅 Status: ${updatedSubscription.status}`);
      console.log(`💰 Price ID: ${updatedSubscription.items.data[0]?.price.id}`);

    } catch (stripeError) {
      console.error('❌ Stripe update failed:', stripeError.message);

      // Still update database if Stripe fails (for consistency)
      console.log('🔄 Updating database only...');
      user.subscription.plan = selectedPlan.key;
      await user.save();

      console.log('✅ Database updated (Stripe update failed)');
      console.log('⚠️  Manual intervention may be required in Stripe dashboard');
    }
  }
}

async function main() {
  console.log('\n🔄 Manage User Subscription Script\n');
  console.log('This script creates new subscriptions or changes existing subscription plans.\n');

  // Get arguments
  const email = process.argv[2];
  const planArg = process.argv[3];

  if (!email) {
    console.log('❌ Usage: node scripts/manage-user-subscription.js <email> [plan]');
    console.log('💡 Examples:');
    console.log('   node scripts/manage-user-subscription.js user@example.com 1-month  # Create/change to 1-month plan');
    console.log('   node scripts/manage-user-subscription.js user@example.com         # Interactive menu');
    process.exit(1);
  }

  const validPlans = ['free', '1-month', '3-month', '6-month', '12-month'];

  try {
    // Connect to database
    await connectDB();

    // Find user by email
    const user = await findUser(email);
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`👤 Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`📊 Current plan: ${user.subscriptionType || 'free'}`);
    console.log(`📅 Status: ${user.subscriptionStatus || 'none'}`);

    // Get current subscription if exists
    if (user.stripeSubscriptionId) {
      console.log(`🔗 Stripe Subscription ID: ${user.stripeSubscriptionId}`);
    }

    let selectedPlan = null;

    // Check if plan was provided as argument
    if (planArg) {
      if (!validPlans.includes(planArg)) {
        console.log(`❌ Invalid plan. Must be one of: ${validPlans.join(', ')}`);
        process.exit(1);
      }
      selectedPlan = { key: planArg, name: planArg === 'free' ? 'Free' : planArg.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) };
    } else {
      // Display interactive menu
      const plans = await displayMenu(user.subscription.plan || 'free');

      // Get user choice
      const choice = await question('Enter the number of the plan to switch to: ');
      const choiceIndex = parseInt(choice) - 1;

      if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= plans.length) {
        console.log('❌ Invalid choice. Please enter a valid number.');
        process.exit(1);
      }

      selectedPlan = plans[choiceIndex];
    }

    // Check if same plan
    if (selectedPlan.key === (user.subscription.plan || 'free')) {
      console.log('ℹ️  User is already on this plan. No changes needed.');
      process.exit(0);
    }

    // Determine action based on current user state
    const hasActiveSubscription = user.stripeSubscriptionId && user.subscription.isActive;
    const action = hasActiveSubscription ? 'change' : 'create';

    // Confirm action
    const actionText = action === 'create' ? `Create ${selectedPlan.name} subscription` : `Change plan to ${selectedPlan.name}`;
    const confirm = await question(`\n⚠️  ${actionText} for ${user.firstName} ${user.lastName}? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }

    if (action === 'create') {
      // Validate required account fields for new subscriptions
      if (!user.firstName?.trim() || !user.lastName?.trim() || !user.email?.trim()) {
        console.log('❌ User account is incomplete. Missing required fields: firstName, lastName, or email');
        process.exit(1);
      }

      // Create new subscription
      const result = await createStripeSubscription(user, selectedPlan.key);

      console.log('\n🎉 Subscription created successfully!');
      console.log(`📊 Plan: ${selectedPlan.key}`);
      console.log(`📅 Status: ${result.subscription.status}`);
      console.log(`🔗 Subscription ID: ${result.subscription.id}`);
      console.log(`👤 Customer ID: ${result.customer.id}`);
      console.log(`💰 Price ID: ${result.subscription.items.data[0]?.price.id}`);

      const periodEnd = new Date(result.subscription.current_period_end * 1000);
      console.log(`📅 Current period ends: ${periodEnd.toLocaleDateString()}`);

    } else {
      // Change existing subscription plan
      await changeUserPlan(user, selectedPlan);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.connection.close();
  }
}

// Handle script interruption
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Operation interrupted');
  rl.close();
  await mongoose.connection.close();
  process.exit(0);
});

main();
