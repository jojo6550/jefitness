#!/usr/bin/env node

/**
 * Diagnose User Subscriptions
 * Shows user's Subscription records and User.subscription subdoc status
 * Usage: node scripts/diagnose-subscriptions.js --email=user@example.com
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness');
  console.log('✅ DB connected');
}

async function diagnoseUser(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log(`\n👤 User: ${user.email}`);
  console.log(`ID: ${user._id}`);
  console.log(`User.subscription.isActive: ${user.subscription?.isActive}`);
  console.log(`User.subscription.plan: ${user.subscription?.plan || 'N/A'}`);
  console.log(`User.subscription.currentPeriodEnd: ${user.subscription?.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd).toISOString() : 'N/A'}`);

  const subs = await Subscription.find({ userId: user._id }).sort({ createdAt: -1 });
  console.log(`\n📋 Subscription docs (${subs.length}):`);
  subs.forEach((sub, i) => {
    const now = new Date();
    const end = new Date(sub.currentPeriodEnd);
    const daysLeft = Math.floor((end - now) / (1000 * 60 * 60 * 24));
    console.log(`  ${i+1}. ID:${sub._id} plan:${sub.plan} status:${sub.status} end:${end.toISOString()} daysLeft:${daysLeft}`);
    console.log(`     stripeSub:${sub.stripeSubscriptionId}`);
  });

  if (subs.length === 0) {
    console.log('✅ No stale subs - issue likely frontend only');
  } else if (subs[0].status === 'canceled' || daysLeft <= 0) {
    console.log('\n🔧 RECOMMEND: Run fix script to clean stale record');
  }
}

(async () => {
  const email = process.argv.find(arg => arg.startsWith('--email=')).split('=')[1];
  if (!email) {
    console.log('Usage: node scripts/diagnose-subscriptions.js --email=user@example.com');
    process.exit(1);
  }

  await connectDB();
  await diagnoseUser(email);
  mongoose.disconnect();
})();

