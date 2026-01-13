#!/usr/bin/env node

/**
 * Backfill subscriptionStatus field for existing users
 * 
 * This script sets subscriptionStatus for users who have active subscriptions
 * but don't have the subscriptionStatus field set (e.g., users created before the field was added).
 * 
 * Run with: node scripts/backfill-subscription-status.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import User model
const User = require('../src/models/User');

async function connectDB() {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/jefitness';

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      family: 4
    });

    console.log('✅ Connected to database\n');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Make sure MongoDB is running and MONGO_URI is set in your .env file');
    return false;
  }
}

async function backfillSubscriptionStatus() {
  console.log('🔄 Backfilling subscriptionStatus field...\n');

  // Find users with active subscriptions but no subscriptionStatus
  const query = {
    $and: [
      { 'subscription.isActive': true },
      { $or: [
        { subscriptionStatus: { $exists: false } },
        { subscriptionStatus: null },
        { subscriptionStatus: '' }
      ]}
    ]
  };

  const users = await User.find(query);
  
  console.log(`Found ${users.length} users with active subscriptions needing subscriptionStatus backfill\n`);

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    // Check if subscription has expired
    const hasExpired = user.subscription.currentPeriodEnd && 
                      new Date() > user.subscription.currentPeriodEnd;

    let newStatus;
    if (hasExpired) {
      newStatus = 'expired';
    } else {
      newStatus = 'active';
    }

    // Only update if different
    if (user.subscriptionStatus !== newStatus) {
      user.subscriptionStatus = newStatus;
      await user.save();
      console.log(`  ✅ Updated user ${user.email}: subscriptionStatus = '${newStatus}'`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total users processed: ${users.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (already correct): ${skipped}`);

  return users.length;
}

async function main() {
  console.log('\n🔄 Backfill subscriptionStatus Script');
  console.log('=====================================\n');

  const connected = await connectDB();
  if (!connected) process.exit(1);

  try {
    await backfillSubscriptionStatus();
    console.log('\n✅ Backfill complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔒 Database connection closed');
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Operation interrupted');
  await mongoose.connection.close();
  process.exit(0);
});

main();

