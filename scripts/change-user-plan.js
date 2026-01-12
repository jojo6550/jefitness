#!/usr/bin/env node

/**
 * Change User Plan Script
 *
 * This script allows changing a user's subscription plan and type
 * Run with: node scripts/change-user-plan.js <email>
 */

const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models and services
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const { updateSubscription, getPlanPricing } = require('../src/services/stripe');

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

async function main() {
  console.log('\n🔄 User Plan Change Script\n');

  // Get email from command line arguments
  const email = process.argv[2];
  if (!email) {
    console.log('❌ Usage: node scripts/change-user-plan.js <email>');
    console.log('💡 Example: node scripts/change-user-plan.js user@example.com');
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
    console.log(`📊 Current plan: ${user.subscriptionType || 'free'}`);
    console.log(`📅 Status: ${user.subscriptionStatus || 'none'}`);

    // Get current subscription if exists
    if (user.stripeSubscriptionId) {
      console.log(`🔗 Stripe Subscription ID: ${user.stripeSubscriptionId}`);
    }

    // Display menu
    const plans = await displayMenu(user.subscriptionType || 'free');

    // Get user choice
    const choice = await question('Enter the number of the plan to switch to: ');
    const choiceIndex = parseInt(choice) - 1;

    if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= plans.length) {
      console.log('❌ Invalid choice. Please enter a valid number.');
      process.exit(1);
    }

    const selectedPlan = plans[choiceIndex];

    // Check if same plan
    if (selectedPlan.key === (user.subscriptionType || 'free')) {
      console.log('ℹ️  User is already on this plan. No changes needed.');
      process.exit(0);
    }

    // Confirm change
    const confirm = await question(`\n⚠️  Change ${user.firstName}'s plan from ${user.subscriptionType || 'free'} to ${selectedPlan.name}? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }

    console.log('\n🔄 Updating subscription...');

    if (selectedPlan.key === 'free') {
      // Cancel subscription for free tier
      if (user.stripeSubscriptionId) {
        try {
          const { cancelSubscription } = require('../src/services/stripe');
          await cancelSubscription(user.stripeSubscriptionId, true); // Cancel at period end
          console.log('✅ Stripe subscription cancelled (will end at period end)');
        } catch (stripeError) {
          console.error('❌ Stripe cancellation failed:', stripeError.message);
        }
      }

      // Update user to free tier
      user.subscriptionStatus = 'free';
      user.subscriptionType = null;
      user.stripeSubscriptionId = null;
      user.stripePriceId = null;
      user.currentPeriodStart = null;
      user.currentPeriodEnd = null;
      user.cancelAtPeriodEnd = false;

      await user.save();
      console.log('✅ User updated to free tier');

    } else {
      // Paid plan - check if user has existing subscription
      if (!user.stripeSubscriptionId) {
        console.log('❌ User does not have an active Stripe subscription');
        console.log('💡 Use the subscription creation endpoint instead');
        process.exit(1);
      }

      // Update subscription in Stripe
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
          subscriptionRecord.priceId = updatedSubscription.items.data[0]?.price.id;
          subscriptionRecord.currentPeriodStart = updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : new Date();
          subscriptionRecord.currentPeriodEnd = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now
          subscriptionRecord.cancelAtPeriodEnd = updatedSubscription.cancel_at_period_end || false;
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
        user.subscriptionType = selectedPlan.key;
        await user.save();

        console.log('✅ Database updated (Stripe update failed)');
        console.log('⚠️  Manual intervention may be required in Stripe dashboard');
      }
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
