
const cron = require('node-cron');
const Subscription = require('./models/Subscription');
const { logSecurityEvent } = require('./services/logger');
const stripeService = require('./services/stripe');

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
        console.log(`📑 Found ${expiredSubscriptions.length} potentially expired subscriptions to verify.`);

        const stripe = stripeService.getStripe();

        for (const sub of expiredSubscriptions) {
          // Verify with Stripe before marking canceled — Stripe is the source of truth.
          // Period dates in the DB can be stale (e.g. Stripe test mode compresses billing
          // cycles so currentPeriodEnd may be in the past even for an active subscription).
          if (stripe && sub.stripeSubscriptionId) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
              const STRIPE_ACTIVE = ['active', 'trialing', 'past_due', 'paused', 'incomplete'];

              if (STRIPE_ACTIVE.includes(stripeSub.status)) {
                // Stripe says it is still active — sync the updated period dates and status,
                // do NOT mark as canceled.
                await Subscription.findByIdAndUpdate(
                  sub._id,
                  {
                    $set: {
                      status: stripeSub.status,
                      currentPeriodStart: stripeSub.current_period_start
                        ? new Date(stripeSub.current_period_start * 1000)
                        : sub.currentPeriodStart,
                      currentPeriodEnd: stripeSub.current_period_end
                        ? new Date(stripeSub.current_period_end * 1000)
                        : sub.currentPeriodEnd,
                      lastWebhookEventAt: new Date()
                    }
                  },
                  { runValidators: false }
                );
                console.log(`ℹ️ Subscription ${sub._id} is still ${stripeSub.status} in Stripe — period dates synced, not canceled.`);
                continue;
              }

              // Stripe confirms the subscription is no longer active — safe to mark canceled.
              console.log(`✅ Stripe confirms subscription ${sub._id} is ${stripeSub.status} — marking canceled in DB.`);
            } catch (stripeErr) {
              // Cannot reach Stripe — skip this subscription rather than incorrectly canceling.
              console.warn(`⚠️ Could not verify subscription ${sub._id} with Stripe: ${stripeErr.message}. Skipping to avoid incorrect cancellation.`);
              continue;
            }
          }

          // No Stripe ID or Stripe confirmed canceled — mark as canceled in DB.
          sub.status = 'canceled';
          sub.statusHistory.push({
            status: 'canceled',
            changedAt: now,
            reason: `Automatically canceled after Stripe verification (Period end: ${sub.currentPeriodEnd})`
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
