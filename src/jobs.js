const cron = require('node-cron');

const Subscription = require('./models/Subscription');
const User = require('./models/User');
const { logSecurityEvent, logger } = require('./services/logger');
const stripeService = require('./services/stripe');
const { sendSubscriptionReminder, sendTrainerDailySchedule } = require('./services/email');
const Appointment = require('./models/Appointment');

/**
 * Daily cleanup: expired 'active' subscriptions → 'trialing'
 * Verifies with Stripe before changing state
 */
const startSubscriptionCleanupJob = () => {
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily subscription cleanup job');

    try {
      const now = new Date();

      // Find potentially expired 'active' subs (1 doc per user)
      const expiredSubscriptions = await Subscription.find({
        status: 'active',
        $or: [
          { 'overrideEndDate': { $lt: now } },
          { $and: [{ 'overrideEndDate': null }, { currentPeriodEnd: { $lt: now } }] },
        ],
      });

      if (!expiredSubscriptions.length) {
        logger.info('No expired subscriptions found today');
        return;
      }

      logger.info('Found potentially expired subscriptions to verify', { count: expiredSubscriptions.length });

      const stripe = stripeService.getStripe();

      for (const sub of expiredSubscriptions) {
        const effectiveEnd = sub.overrideEndDate || sub.currentPeriodEnd;

        // Verify with Stripe if Stripe ID present
        if (stripe && sub.stripeSubscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

            // Stripe active/trialing? Sync dates, stay 'active'
            if (['active', 'trialing'].includes(stripeSub.status)) {
              await Subscription.findOneAndUpdate(
                { userId: sub.userId },
                {
                  $set: {
                    currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : sub.currentPeriodStart,
                    currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : sub.currentPeriodEnd,
                  },
                }
              );
              logger.info('Stripe active, dates synced', { userId: sub.userId });
              continue;
            }
          } catch (stripeErr) {
            logger.warn('Stripe verification failed, proceeding with expiration check', { userId: sub.userId, error: stripeErr.message });
          }
        }

        // No active Stripe or verification failed + DB expired → set 'trialing'
        await Subscription.findOneAndUpdate(
          { userId: sub.userId },
          {
            $set: { 
              status: 'trialing',
            },
            $push: {
              statusHistory: {
                status: 'trialing',
                changedAt: now,
                reason: `Auto-set to trialing (expired ${effectiveEnd})`,
              },
            },
          }
        );

        await User.findOneAndUpdate(
          { _id: sub.userId },
          { $set: { subscriptionStatus: 'trialing' } }
        );

        logger.info('Subscription expired → trialing', { userId: sub.userId });
      }
    } catch (error) {
      logger.error('Error in subscription cleanup job', { error: error.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', {
        jobName: 'subscriptionCleanup',
        error: error.message,
      });
    }
  });

  logger.info('Subscription cleanup cron scheduled (0 0 * * *)');
};

/**
 * Renewal reminders for 'active' subs expiring soon
 */
const startRenewalReminderJob = () => {
  cron.schedule('0 8 * * *', async () => {
    logger.info('🔔 Running renewal reminder job...');
    try {
      const now = new Date();
      const REMINDER_DAYS = [3, 7];

      for (const days of REMINDER_DAYS) {
        const windowStart = new Date(now);
        windowStart.setUTCDate(windowStart.getUTCDate() + days);
        windowStart.setUTCHours(0, 0, 0, 0);
        const windowEnd = new Date(windowStart);
        windowEnd.setUTCHours(23, 59, 59, 999);

        const subs = await Subscription.find({
          status: 'active',
          currentPeriodEnd: { $gte: windowStart, $lte: windowEnd },
        });

        for (const sub of subs) {
          const effectiveEnd = sub.overrideEndDate || sub.currentPeriodEnd;
          if (effectiveEnd < windowStart) continue;

          try {
            const user = await User.findById(sub.userId).select('firstName email privacySettings');
            if (!user || !user.email || user.privacySettings?.marketingEmails === false) continue;

            const renewalDate = effectiveEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            await sendSubscriptionReminder(user.email, user.firstName, sub.plan, days, renewalDate);
            logger.info(`Reminder sent (${days}d)`, { userId: user._id });
          } catch (userErr) {
            logger.error('Reminder email failed', { userId: sub.userId, error: userErr.message });
          }
        }
      }
    } catch (err) {
      logger.error('Renewal reminder job error', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', { jobName: 'renewalReminder', error: err.message });
    }
  });

  logger.info('Renewal reminder cron scheduled (0 8 * * *)');
};

/**
 * Trainer daily schedule emails - UNCHANGED
 */
const startTrainerDailyEmailJob = () => {
  cron.schedule('0 4 * * *', async () => {
    logger.info('Running trainer schedule email job');
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
        logger.info('No trainer appointments today');
        return;
      }

      const byTrainer = {};
      for (const apt of appointments) {
        if (!apt.trainerId || !apt.trainerId.email || apt.trainerId.trainerEmailPreference === 'individual') continue;
        const tid = apt.trainerId._id.toString();
        if (!byTrainer[tid]) byTrainer[tid] = { trainer: apt.trainerId, appointments: [] };
        const clientName = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}` : 'Unknown Client';
        byTrainer[tid].appointments.push({ clientName, time: apt.time });
      }

      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

      for (const { trainer, appointments: trainerApts } of Object.values(byTrainer)) {
        trainerApts.sort((a, b) => a.time.localeCompare(b.time));
        try {
          await sendTrainerDailySchedule(trainer.email, trainer.firstName, dateStr, trainerApts);
          logger.info('Trainer schedule sent', { trainerId: trainer._id, count: trainerApts.length });
        } catch (emailErr) {
          logger.error('Trainer email failed', { trainerId: trainer._id, error: emailErr.message });
        }
      }
    } catch (err) {
      logger.error('Trainer email job error', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', 'system', { jobName: 'trainerDailyEmail', error: err.message });
    }
  });

  logger.info('Trainer email cron scheduled (0 4 * * *)');
};

module.exports = { startSubscriptionCleanupJob, startRenewalReminderJob, startTrainerDailyEmailJob };

