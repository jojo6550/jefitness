/**
 * Migration script to fix subscription.isActive flag for existing users
 * 
 * This script updates users who have subscription data but don't have
 * subscription.isActive set to true, ensuring frontend subscription checks work correctly.
 * 
 * Run with: node scripts/fix-subscription-flags.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const User = require('../src/models/User');

async function fixSubscriptionFlags() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find users who have stripeSubscriptionId but subscription.isActive is false or undefined
    const usersToFix = await User.find({
      $or: [
        { 'subscription.isActive': { $exists: false } },
        { 'subscription.isActive': false }
      ],
      stripeSubscriptionId: { $exists: true, $ne: null }
    });

    console.log(`\nFound ${usersToFix.length} users with subscriptions needing fixes`);

    let fixedCount = 0;
    let alreadyActiveCount = 0;

    for (const user of usersToFix) {
      const wasActive = user.subscription?.isActive;
      
      // Set subscription.isActive to true
      if (!user.subscription) {
        user.subscription = {};
      }
      user.subscription.isActive = true;
      
      // Also sync other subscription fields if they're missing
      if (!user.subscription.stripeSubscriptionId) {
        user.subscription.stripeSubscriptionId = user.stripeSubscriptionId;
      }
      if (!user.subscription.plan && user.subscriptionType) {
        user.subscription.plan = user.subscriptionType;
      }
      if (!user.subscription.stripePriceId) {
        user.subscription.stripePriceId = user.stripePriceId;
      }
      if (!user.subscription.currentPeriodStart && user.currentPeriodStart) {
        user.subscription.currentPeriodStart = user.currentPeriodStart;
      }
      if (!user.subscription.currentPeriodEnd && user.currentPeriodEnd) {
        user.subscription.currentPeriodEnd = user.currentPeriodEnd;
      }

      await user.save();
      
      if (wasActive === true) {
        alreadyActiveCount++;
      } else {
        fixedCount++;
        console.log(`  ✅ Fixed user: ${user.email} (${user._id})`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   - Users fixed: ${fixedCount}`);
    console.log(`   - Users already active: ${alreadyActiveCount}`);
    console.log(`   - Total processed: ${usersToFix.length}`);

    // Also update users who have no subscription sub-document but have stripeSubscriptionId
    const usersMissingSubDoc = await User.find({
      subscription: { $exists: false },
      stripeSubscriptionId: { $exists: true, $ne: null }
    });

    console.log(`\nFound ${usersMissingSubDoc.length} users missing subscription sub-document`);

    for (const user of usersMissingSubDoc) {
      user.subscription = {
        isActive: true,
        plan: user.subscriptionType || null,
        stripePriceId: user.stripePriceId || null,
        stripeSubscriptionId: user.stripeSubscriptionId,
        currentPeriodStart: user.currentPeriodStart || null,
        currentPeriodEnd: user.currentPeriodEnd || null
      };
      await user.save();
      console.log(`  ✅ Added subscription sub-document for: ${user.email} (${user._id})`);
    }

    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  fixSubscriptionFlags()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = fixSubscriptionFlags;

