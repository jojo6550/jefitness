
const cron = require('node-cron');
const Subscription = require('./models/Subscription');
const { logSecurityEvent } = require('./services/logger');

/**
 * Daily cleanup for expired subscriptions
 * Runs every day at midnight
 */
const startSubscriptionCleanupJob = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running daily subscription cleanup job...');
    
    try {
      const now = new Date();
      
      // Find active subscriptions that have passed their end date
      const expiredSubscriptions = await Subscription.find({
        status: { $in: ['active', 'past_due'] },
        currentPeriodEnd: { $lt: now }
      });

      if (expiredSubscriptions.length > 0) {
        console.log(`📑 Found ${expiredSubscriptions.length} expired subscriptions to update.`);
        
        for (const sub of expiredSubscriptions) {
          const oldStatus = sub.status;
          sub.status = 'canceled';
          sub.statusHistory.push({
            status: 'canceled',
            changedAt: now,
            reason: `Automatically canceled due to expiration (Period end: ${sub.currentPeriodEnd})`
          });
          
          await sub.save();
          console.log(`✅ Subscription ${sub._id} for user ${sub.userId} marked as canceled.`);
        }
      } else {
        console.log('ℹ️ No expired subscriptions found today.');
      }
    } catch (error) {
      console.error('❌ Error in subscription cleanup job:', error);
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', {
        jobName: 'subscriptionCleanup',
        error: error.message
      });
    }
  });
  
  console.log('⏰ Subscription cleanup cron job scheduled (0 0 * * *)');
};

module.exports = { startSubscriptionCleanupJob };
