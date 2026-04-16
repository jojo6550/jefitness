/**
 * JE Fitness Stress Test — Direct DB Cleanup
 * Deletes ALL stress-test accounts (no admin login, no HTTP)
 *
 * Usage:
 *   node src/tests/stress/cleanup.js
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../../../config/db');

// Path to your User model (works from src/tests/stress/)
const User = require('../../models/User');

// ─── Main Cleanup ─────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n🧹 JE Fitness Stress Test Cleanup (Direct DB)');

  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    // Delete every stress-test account
    const result = await User.deleteMany({
      email: { $regex: /@mailtest\.jefitnessja\.com$/i },
    });

    console.log(`\n🎉 Cleanup complete!`);
    console.log(`   Deleted ${result.deletedCount} stress-test accounts`);
    console.log(`   (all emails ending with @mailtest.jefitnessja.com)\n`);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.error('   → Is MongoDB running?');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

cleanup().catch(console.error);
