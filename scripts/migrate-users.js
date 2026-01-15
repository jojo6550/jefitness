#!/usr/bin/env node

/**
 * User Migration Script
 *
 * This script updates all existing users to match the current schema
 * Run with: node scripts/migrate-users.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models and services
const User = require('../src/models/User');

// Lazy initialization of Stripe to avoid issues in test environment
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

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

async function createStripeCustomerForUser(user) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || user.stripeCustomerId) {
      return; // Skip if no Stripe key or customer already exists
    }

    const stripe = getStripe();
    if (!stripe) return; // Skip if Stripe not initialized

    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user._id.toString()
      }
    });

    user.stripeCustomerId = customer.id;
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
    console.log(`✅ Created Stripe customer for ${user.email}: ${customer.id}`);
  } catch (err) {
    console.error(`❌ Stripe customer creation failed for ${user.email}:`, err.message);
    // Stripe failure does not block migration
  }
}

async function migrateUser(user) {
  let updated = false;

  // Set default values for missing fields
  if (user.subscriptionStatus === undefined) {
    user.subscriptionStatus = 'inactive';
    updated = true;
  }

  if (user.role === undefined) {
    user.role = 'user';
    updated = true;
  }

  if (user.activityStatus === undefined) {
    user.activityStatus = 'active';
    updated = true;
  }

  if (user.isEmailVerified === undefined) {
    user.isEmailVerified = false;
    updated = true;
  }

  if (user.onboardingCompleted === undefined) {
    user.onboardingCompleted = false;
    updated = true;
  }

  if (user.failedLoginAttempts === undefined) {
    user.failedLoginAttempts = 0;
    updated = true;
  }

  if (user.cancelAtPeriodEnd === undefined) {
    user.cancelAtPeriodEnd = false;
    updated = true;
  }

  if (user.billingEnvironment === undefined) {
    user.billingEnvironment = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production';
    updated = true;
  }

  // Initialize consent fields if missing
  if (!user.dataProcessingConsent) {
    user.dataProcessingConsent = {
      given: false,
      version: '1.0'
    };
    updated = true;
  }

  if (!user.healthDataConsent) {
    user.healthDataConsent = {
      given: false,
      version: '1.0',
      purpose: 'fitness_tracking'
    };
    updated = true;
  }

  if (!user.marketingConsent) {
    user.marketingConsent = {
      given: false,
      version: '1.0'
    };
    updated = true;
  }

  // Initialize schedule if missing
  if (!user.schedule) {
    user.schedule = {
      lastReset: new Date(),
      plans: []
    };
    updated = true;
  }

  // Initialize arrays if missing
  if (!user.nutritionLogs) {
    user.nutritionLogs = [];
    updated = true;
  }

  if (!user.sleepLogs) {
    user.sleepLogs = [];
    updated = true;
  }

  if (!user.assignedPrograms) {
    user.assignedPrograms = [];
    updated = true;
  }

  if (!user.purchasedPrograms) {
    user.purchasedPrograms = [];
    updated = true;
  }

  if (!user.medicalDocuments) {
    user.medicalDocuments = [];
    updated = true;
  }

  if (!user.auditLog) {
    user.auditLog = [];
    updated = true;
  }

  // Create Stripe customer if missing
  if (!user.stripeCustomerId) {
    await createStripeCustomerForUser(user);
    updated = true;
  }

  // Save user if any updates were made
  if (updated) {
    await user.save();
    console.log(`✅ Migrated user: ${user.email}`);
  } else {
    console.log(`ℹ️  No changes needed for user: ${user.email}`);
  }
}

async function main() {
  console.log('\n🔄 User Migration Script\n');
  console.log('This script updates all existing users to match the current schema.\n');

  try {
    // Connect to database
    await connectDB();

    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to migrate\n`);

    let migratedCount = 0;
    let errorCount = 0;

    // Migrate each user
    for (const user of users) {
      try {
        await migrateUser(user);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Successfully migrated: ${migratedCount} users`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} users`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Handle script interruption
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Migration interrupted');
  await mongoose.connection.close();
  process.exit(0);
});

main();
