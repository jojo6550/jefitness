#!/usr/bin/env node
/**
 * ONE-TIME MIGRATION: Fix subscription dates from local timezone to UTC
 * Run: node scripts/fix-subscription-dates.js
 */

const mongoose = require('mongoose');

const Subscription = require('../src/models/Subscription');
const { logger } = require('../src/services/logger');

// Load environment
require('dotenv').config({ path: './.env' });

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find ALL subscriptions
    const subs = await Subscription.find({});
    console.log(`📊 Found ${subs.length} subscription(s)`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const sub of subs) {
      try {
        let needsUpdate = false;

        // Fix period dates (convert local Date back to UTC timestamp equivalent)
        if (sub.currentPeriodStart && !(sub.currentPeriodStart instanceof Date)) {
          sub.currentPeriodStart = new Date(sub.currentPeriodStart);
          needsUpdate = true;
        }
        if (sub.currentPeriodEnd && !(sub.currentPeriodEnd instanceof Date)) {
          sub.currentPeriodEnd = new Date(sub.currentPeriodEnd);
          needsUpdate = true;
        }
        if (sub.canceledAt && !(sub.canceledAt instanceof Date)) {
          sub.canceledAt = new Date(sub.canceledAt);
          needsUpdate = true;
        }

        // Fix mongoose timestamps (most likely cause)
        if (sub.createdAt) {
          // Reconstruct UTC timestamp from local Date (shift back by server TZ offset)
          const originalUTC = sub.createdAt.getTime() - 5 * 60 * 60 * 1000; // Jamaica UTC-5
          sub.createdAt = new Date(originalUTC);
          needsUpdate = true;
        }
        if (sub.updatedAt) {
          const originalUTC = sub.updatedAt.getTime() - 5 * 60 * 60 * 1000; // Jamaica UTC-5
          sub.updatedAt = new Date(originalUTC);
          needsUpdate = true;
        }

        if (needsUpdate) {
          await sub.save();
          fixedCount++;
          console.log(`✅ Fixed: ${sub._id} | Plan: ${sub.plan}`);
        }
      } catch (err) {
        console.error(`❌ Error fixing ${sub._id}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n🎉 MIGRATION COMPLETE');
    console.log(`✅ Fixed: ${fixedCount} subscriptions`);
    console.log(`❌ Errors: ${errorCount}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

main().catch(console.error);
