const cron = require('node-cron');

const Subscription = require('./models/Subscription');
const User = require('./models/User');
const { logSecurityEvent, logger } = require('./services/logger');
const stripeService = require('./services/stripe');
const { sendSubscriptionReminder, sendTrainerDailySchedule } = require('./services/email');
const Appointment = require('./models/Appointment');

/** Subscription statuses considered still active in Stripe */
const STRIPE_ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'paused', 'incomplete'];

/**
 * Daily cleanup for expired subscriptions.
 * Runs every day at midnight. Verifies with Stripe before marking a
 * subscription as canceled — Stripe is the authoritative source of truth.
 */
const startSubscriptionCleanupJob = () => {
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily subscription cleanup job');

    try {
      const now = new Date();

      const expiredSubscriptions = await Subscription.find({
        status: { $in: ['active', 'past_due'] },
        currentPeriodEnd: { $lt: now },
      });

      if (!expiredSubscriptions.length) {
        logger.info('No expired subscriptions found today');
        return;
      }

      logger.info('Found potentially expired subscriptions to verify', { count: expiredSubscriptions.length });

      const stripe = stripeService.getStripe();

      for (const sub of expiredSubscriptions) {
        // Always verify with Stripe before canceling — period dates in the DB can
        // be stale (e.g. Stripe test mode compresses billing cycles).
        if (stripe && sub.stripeSubscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(
              sub.stripeSubscriptionId
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
                { runValidators: false }
              );
              logger.info('Subscription still active in Stripe, period dates synced', { subscriptionId: sub._id, stripeStatus: stripeSub.status });
              continue;
            }

            // Stripe confirms inactive — safe to mark canceled.
            logger.info('Stripe confirms subscription inactive, marking canceled', { subscriptionId: sub._id, stripeStatus: stripeSub.status });
          } catch (stripeErr) {
            // Cannot reach Stripe — skip rather than incorrectly canceling.
            logger.warn('Could not verify subscription with Stripe, skipping', { subscriptionId: sub._id, error: stripeErr.message });
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
        logger.info('Subscription marked as canceled', { subscriptionId: sub._id, userId: sub.userId });
      }
    } catch (error) {
      logger.error('Error in subscription cleanup job', { error: error.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', {
        jobName: 'subscriptionCleanup',
        error: error.message,
      });
    }
  });

  logger.info('Subscription cleanup cron job scheduled', { schedule: '0 0 * * *' });
};

/**
 * Daily reminder job — runs at 8 AM.
 * Sends renewal reminder emails for subscriptions expiring in 3 or 7 days.
 */
const startRenewalReminderJob = () => {
  cron.schedule('0 8 * * *', async () => {
    logger.info('🔔 Running subscription renewal reminder job...');
    try {
      const now = new Date();
      const REMINDER_DAYS = [3, 7];

      for (const days of REMINDER_DAYS) {
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() + days);
        windowStart.setHours(0, 0, 0, 0);

        const windowEnd = new Date(windowStart);
        windowEnd.setHours(23, 59, 59, 999);

        const subs = await Subscription.find({
          status: { $in: ['active', 'trialing'] },
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { $gte: windowStart, $lte: windowEnd },
        });

        for (const sub of subs) {
          try {
            const user = await User.findById(sub.userId).select('firstName email privacySettings');
            if (!user || !user.email) continue;
            if (user.privacySettings?.marketingEmails === false) continue;

            const renewalDate = sub.currentPeriodEnd.toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            });
            await sendSubscriptionReminder(user.email, user.firstName, sub.plan, days, renewalDate);
            logger.info(`Renewal reminder sent (${days}d)`, { userId: user._id, subId: sub._id });
          } catch (userErr) {
            logger.error('Failed to send renewal reminder', { subId: sub._id, error: userErr.message });
          }
        }
      }
    } catch (err) {
      logger.error('Renewal reminder job error', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', { jobName: 'renewalReminder', error: err.message });
    }
  });

  logger.info('⏰ Renewal reminder cron job scheduled (0 8 * * *)');
};

/**
 * Daily trainer schedule email — runs at 6 AM.
 * For each trainer who has appointments today, sends a schedule email listing
 * client names and times.
 */
const startTrainerDailyEmailJob = () => {
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily trainer schedule email job');
    try {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(now);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const appointments = await Appointment.find({
        date: { $gte: dayStart, $lte: dayEnd },
        status: { $ne: 'cancelled' },
      })
        .populate('trainerId', 'firstName email trainerEmailPreference')
        .populate('clientId', 'firstName lastName')
        .lean();

      if (!appointments.length) {
        logger.info('No trainer appointments today — skipping schedule emails');
        return;
      }

      // Group by trainer — only include trainers who prefer the daily digest
      const byTrainer = {};
      for (const apt of appointments) {
        if (!apt.trainerId || !apt.trainerId.email) continue;
        if (apt.trainerId.trainerEmailPreference === 'individual') continue;
        const tid = apt.trainerId._id.toString();
        if (!byTrainer[tid]) {
          byTrainer[tid] = { trainer: apt.trainerId, appointments: [] };
        }
        const clientName = apt.clientId
          ? `${apt.clientId.firstName} ${apt.clientId.lastName}`
          : 'Unknown Client';
        byTrainer[tid].appointments.push({ clientName, time: apt.time });
      }

      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });

      for (const { trainer, appointments: trainerApts } of Object.values(byTrainer)) {
        trainerApts.sort((a, b) => a.time.localeCompare(b.time));
        try {
          await sendTrainerDailySchedule(trainer.email, trainer.firstName, dateStr, trainerApts);
          logger.info('Trainer daily schedule email sent', { trainerId: trainer._id, count: trainerApts.length });
        } catch (emailErr) {
          logger.error('Failed to send trainer daily schedule email', { trainerId: trainer._id, error: emailErr.message });
        }
      }
    } catch (err) {
      logger.error('Error in trainer daily email job', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', { jobName: 'trainerDailyEmail', error: err.message });
    }
  });

  logger.info('Trainer daily schedule email job scheduled (0 0 * * *)');
};

module.exports = { startSubscriptionCleanupJob, startRenewalReminderJob, startTrainerDailyEmailJob };
