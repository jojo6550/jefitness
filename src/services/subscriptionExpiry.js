const User = require('../models/User');
const { logger } = require('./logger');

/**
 * Service for handling subscription expiry logic
 * Automatically updates user subscription status when currentPeriodEnd is reached
 */

/**
 * Check for expired subscriptions and update their status
 * This function should be called periodically (e.g., daily) via a cron job
 */
async function checkExpiredSubscriptions() {
  try {
    const now = new Date();

    // Find users with active subscriptions that have expired
    const expiredUsers = await User.find({
      subscriptionStatus: 'active',
      currentPeriodEnd: { $lt: now }
    });

    let updatedCount = 0;

    for (const user of expiredUsers) {
      // Update subscription status to expired
      user.subscriptionStatus = 'expired';

      // Clear subscription data if it was set to cancel at period end
      if (user.cancelAtPeriodEnd) {
        user.stripeSubscriptionId = null;
        user.subscriptionType = null;
        user.stripePriceId = null;
        user.currentPeriodStart = null;
        user.currentPeriodEnd = null;
        user.cancelAtPeriodEnd = false;
        user.subscriptionStatus = 'cancelled';
      }

      await user.save();
      updatedCount++;

      logger.info(`Subscription expired for user ${user._id}`, {
        userId: user._id,
        previousStatus: 'active',
        newStatus: user.subscriptionStatus,
        expiryDate: user.currentPeriodEnd
      });
    }

    if (updatedCount > 0) {
      console.log(`✅ Updated ${updatedCount} expired subscriptions`);
    }

    return updatedCount;
  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
    logger.error('Error in checkExpiredSubscriptions', { error: error.message });
    throw error;
  }
}

/**
 * Check for subscriptions that are past due and should be cancelled
 * This handles cases where payments failed and grace period has expired
 */
async function checkPastDueSubscriptions() {
  try {
    const now = new Date();
    // Consider subscriptions past due for more than 30 days as cancelled
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const pastDueUsers = await User.find({
      subscriptionStatus: 'past_due',
      updatedAt: { $lt: thirtyDaysAgo }
    });

    let cancelledCount = 0;

    for (const user of pastDueUsers) {
      user.subscriptionStatus = 'cancelled';
      user.stripeSubscriptionId = null;
      user.subscriptionType = null;
      user.stripePriceId = null;
      user.currentPeriodStart = null;
      user.currentPeriodEnd = null;
      user.cancelAtPeriodEnd = false;

      await user.save();
      cancelledCount++;

      logger.info(`Past due subscription cancelled for user ${user._id}`, {
        userId: user._id,
        previousStatus: 'past_due',
        newStatus: 'cancelled'
      });
    }

    if (cancelledCount > 0) {
      console.log(`✅ Cancelled ${cancelledCount} past due subscriptions`);
    }

    return cancelledCount;
  } catch (error) {
    console.error('Error checking past due subscriptions:', error);
    logger.error('Error in checkPastDueSubscriptions', { error: error.message });
    throw error;
  }
}

/**
 * Run all subscription maintenance tasks
 * This is the main function that should be called by the cron job
 */
async function runSubscriptionMaintenance() {
  try {
    console.log('🔄 Running subscription maintenance...');

    const expiredCount = await checkExpiredSubscriptions();
    const pastDueCount = await checkPastDueSubscriptions();

    const totalUpdated = expiredCount + pastDueCount;

    if (totalUpdated > 0) {
      console.log(`✅ Subscription maintenance completed. Updated ${totalUpdated} subscriptions.`);
    } else {
      console.log('✅ Subscription maintenance completed. No updates needed.');
    }

    return { expiredCount, pastDueCount, totalUpdated };
  } catch (error) {
    console.error('Error in subscription maintenance:', error);
    logger.error('Error in runSubscriptionMaintenance', { error: error.message });
    throw error;
  }
}

module.exports = {
  checkExpiredSubscriptions,
  checkPastDueSubscriptions,
  runSubscriptionMaintenance
};
