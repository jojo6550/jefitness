const cron = require('node-cron');

const Subscription = require('./models/Subscription');
const { logSecurityEvent } = require('./services/logger');
const stripeService = require('./services/stripe');

/** Subscription statuses considered still active in Stripe */
const STRIPE_ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'paused', 'incomplete'];

/**
 * Daily cleanup for expired subscriptions.
 * Runs every day at midnight. Verifies with Stripe before marking a
 * subscription as canceled — Stripe is the authoritative source of truth.
 */
const startSubscriptionCleanupJob = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running daily subscription cleanup job...');

    try {
      const now = new Date();

      const expiredSubscriptions = await Subscription.find({
        status: { $in: ['active', 'past_due'] },
        currentPeriodEnd: { $lt: now },
      });

      if (!expiredSubscriptions.length) {
        console.log('ℹ️ No expired subscriptions found today.');
        return;
      }

      console.log(
        `📑 Found ${expiredSubscriptions.length} potentially expired subscriptions to verify.`,
      );

      const stripe = stripeService.getStripe();

      for (const sub of expiredSubscriptions) {
        // Always verify with Stripe before canceling — period dates in the DB can
        // be stale (e.g. Stripe test mode compresses billing cycles).
        if (stripe && sub.stripeSubscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(
              sub.stripeSubscriptionId,
            );

            if (STRIPE_ACTIVE_STATUSES.includes(stripeSub.status)) {
              // Stripe says still active — sync dates and skip cancellation.
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
                    lastWebhookEventAt: new Date(),
                  },
                },
                { runValidators: false },
              );
              console.log(
                `ℹ️ Subscription ${sub._id} is still ${stripeSub.status} in Stripe — period dates synced.`,
              );
              continue;
            }

            // Stripe confirms inactive — safe to mark canceled.
            console.log(
              `✅ Stripe confirms subscription ${sub._id} is ${stripeSub.status} — marking canceled.`,
            );
          } catch (stripeErr) {
            // Cannot reach Stripe — skip rather than incorrectly canceling.
            console.warn(
              `⚠️ Could not verify subscription ${sub._id} with Stripe: ${stripeErr.message}. Skipping.`,
            );
            continue;
          }
        }

        // No Stripe ID, or Stripe confirmed inactive — mark canceled in DB.
        sub.status = 'canceled';
        sub.statusHistory.push({
          status: 'canceled',
          changedAt: now,
          reason: `Automatically canceled after Stripe verification (period end: ${sub.currentPeriodEnd})`,
        });

        await sub.save();
        console.log(
          `✅ Subscription ${sub._id} for user ${sub.userId} marked as canceled.`,
        );
      }
    } catch (error) {
      console.error('❌ Error in subscription cleanup job:', error);
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', {
        jobName: 'subscriptionCleanup',
        error: error.message,
      });
    }
  });

  console.log('⏰ Subscription cleanup cron job scheduled (0 0 * * *)');
};

module.exports = { startSubscriptionCleanupJob };
