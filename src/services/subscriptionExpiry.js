/**
 * DEPRECATED - Subscription expiry handled automatically by subscriptionService
 * on every access request. No cron needed.
 * 
 * This file can be safely removed after confirming no references remain.
 */
module.exports = {
  checkExpiredSubscriptions: async () => {
    console.warn('subscriptionExpiry.js is deprecated - use subscriptionService');
    return 0;
  },
  runSubscriptionMaintenance: async () => {
    console.warn('subscriptionExpiry.js is deprecated');
    return { expiredCount: 0, pastDueCount: 0, totalUpdated: 0 };
  }
};

