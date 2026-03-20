#!/usr/bin/env node

/**
 * Fix User Subscriptions Script
 *
 * This script creates subscriptions for users who don't have active Stripe subscriptions
 * Run with: node scripts/fix-user-subscriptions.js <email> <plan>
 */

const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models and services
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const { createOrRetrieveCustomer, createSubscription } = require('../src/services/stripe');

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
    const mongoUri = process.env.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
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
    user.subscriptionStatus = subscription.status;
    user.subscriptionType = plan;
    user.stripePriceId = subscription.items.data[0]?.price.id;
    user.currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    user.currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
    user.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;

    await user.save();

    // Create subscription record in database
    const currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date();
    const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

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
      currency: subscription.items.data[0]?.price.currency || 'jmd',
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

async function main() {
  console.log('\n🔧 Fix User Subscriptions Script\n');
  console.log('This script creates subscriptions for users who don\'t have active Stripe subscriptions.\n');

  // Get arguments
  const email = process.argv[2];
  const plan = process.argv[3];

  if (!email) {
    console.log('❌ Usage: node scripts/fix-user-subscriptions.js <email> <plan>');
    console.log('💡 Example: node scripts/fix-user-subscriptions.js user@example.com 1-month');
    console.log('📋 Available plans: 1-month, 3-month, 6-month, 12-month');
    process.exit(1);
  }

  const validPlans = ['1-month', '3-month', '6-month', '12-month'];
  if (!plan || !validPlans.includes(plan)) {
    console.log(`❌ Invalid plan. Must be one of: ${validPlans.join(', ')}`);
    process.exit(1);
  }

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
    console.log(`📊 Current plan: ${user.subscription.plan || 'free'}`);
    console.log(`📅 Status: ${user.subscription.isActive ? 'active' : 'inactive'}`);

    // Check if user already has an active subscription
    if (user.stripeSubscriptionId && user.subscription.isActive) {
      console.log('ℹ️  User already has an active subscription. Use change-user-plan.js instead.');
      process.exit(0);
    }

    // Validate required account fields
    if (!user.firstName?.trim() || !user.lastName?.trim() || !user.email?.trim()) {
      console.log('❌ User account is incomplete. Missing required fields: firstName, lastName, or email');
      process.exit(1);
    }

    // Confirm creation
    const confirm = await question(`\n⚠️  Create ${plan} subscription for ${user.firstName} ${user.lastName}? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }

    console.log('\n🔄 Creating subscription...');

    // Create the subscription
    const result = await createStripeSubscription(user, plan);

    console.log('\n🎉 Subscription created successfully!');
    console.log(`📊 Plan: ${plan}`);
    console.log(`📅 Status: ${result.subscription.status}`);
    console.log(`🔗 Subscription ID: ${result.subscription.id}`);
    console.log(`👤 Customer ID: ${result.customer.id}`);
    console.log(`💰 Price ID: ${result.subscription.items.data[0]?.price.id}`);

    const periodEnd = new Date(result.subscription.current_period_end * 1000);
    console.log(`📅 Current period ends: ${periodEnd.toLocaleDateString()}`);

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
