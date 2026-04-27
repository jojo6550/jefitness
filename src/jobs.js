const cron = require('node-cron');

const Subscription = require('./models/Subscription');
const User = require('./models/User');
const { logSecurityEvent, logger } = require('./services/logger');
const {
  sendSubscriptionReminder,
  sendTrainerDailySchedule,
} = require('./services/email');
const Appointment = require('./models/Appointment');
const { daysBetween, addDays } = require('./utils/dateUtils');

/**
 * Daily cleanup for expired subscriptions.
 * Finds active subs past expiresAt and sets active = false.
 */
const cleanupExpiredSubscriptions = async () => {
  try {
    const now = new Date();

    const result = await Subscription.updateMany(
      { active: true, expiresAt: { $lt: now } },
      { $set: { active: false } }
    );

    if (result.modifiedCount > 0) {
      logger.info('Deactivated expired subscriptions', { count: result.modifiedCount });
    }
  } catch (error) {
    logger.error('cleanupExpiredSubscriptions error', { error: error.message });
  }
};

const startSubscriptionCleanupJob = () => {
  cron.schedule('0 * * * *', cleanupExpiredSubscriptions);
  logger.info('Subscription cleanup cron job scheduled', { schedule: '0 0 * * *' });
};

/**
 * Daily reminder job — runs at 8 AM.
 * Sends renewal reminder emails for subscriptions expiring in 1, 3, or 7 days.
 */
const startRenewalReminderJob = () => {
  cron.schedule('0 8 * * *', async () => {
    logger.info('🔔 Running subscription renewal reminder job...');
    try {
      const now = new Date();
      const REMINDER_DAYS = [1, 3, 7];

      const broadEnd = addDays(now, Math.max(...REMINDER_DAYS) + 1);
      const subs = await Subscription.find({
        active: true,
        expiresAt: { $gt: now, $lte: broadEnd },
      });

      for (const sub of subs) {
        try {
          const daysLeft = daysBetween(now, sub.expiresAt);
          if (!REMINDER_DAYS.includes(daysLeft)) continue;

          const user = await User.findById(sub.userId).select('firstName email');
          if (!user || !user.email) continue;

          const renewalDate = sub.expiresAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          await sendSubscriptionReminder(
            user.email,
            user.firstName,
            'Membership',
            daysLeft,
            renewalDate
          );
          logger.info(`Renewal reminder sent (${daysLeft}d)`, {
            userId: user._id,
            subId: sub._id,
          });
        } catch (userErr) {
          logger.error('Failed to send renewal reminder', {
            subId: sub._id,
            error: userErr.message,
          });
        }
      }
    } catch (err) {
      logger.error('Renewal reminder job error', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', null, {
        jobName: 'renewalReminder',
        error: err.message,
      });
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
  cron.schedule('0 4 * * *', async () => {
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
          await sendTrainerDailySchedule(
            trainer.email,
            trainer.firstName,
            dateStr,
            trainerApts
          );
          logger.info('Trainer daily schedule email sent', {
            trainerId: trainer._id,
            count: trainerApts.length,
          });
        } catch (emailErr) {
          logger.error('Failed to send trainer daily schedule email', {
            trainerId: trainer._id,
            error: emailErr.message,
          });
        }
      }
    } catch (err) {
      logger.error('Error in trainer daily email job', { error: err.message });
      logSecurityEvent('SYSTEM_JOB_ERROR', null, {
        jobName: 'trainerDailyEmail',
        error: err.message,
      });
    }
  });

  logger.info('Trainer daily schedule email job scheduled (0 4 * * * — 4 AM daily)');
};

/**
 * Minute-level job — runs every minute.
 * Sends a "10 minutes until expiry" reminder for subscriptions about to expire.
 * Uses remindersSent dedup field to ensure each subscription only gets one 10min reminder.
 */
const startTenMinuteReminderJob = () => {
  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 11 * 60 * 1000);

      const subs = await Subscription.find({
        active: true,
        expiresAt: { $gte: now, $lte: windowEnd },
      });

      if (!subs.length) return;

      for (const sub of subs) {
        try {
          const user = await User.findById(sub.userId).select(
            'firstName email privacySettings'
          );
          if (!user?.email) continue;
          if (user.privacySettings?.marketingEmails === false) continue;

          const renewalDate = sub.expiresAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });

          await sendSubscriptionReminder(
            user.email,
            user.firstName,
            'Membership',
            '10 minutes',
            renewalDate
          );

          logger.info('10-min expiry reminder sent', {
            subId: sub._id,
            userId: user._id,
          });
        } catch (subErr) {
          logger.error('10-min reminder failed for sub', {
            subId: sub._id,
            error: subErr.message,
          });
        }
      }
    } catch (err) {
      logger.error('10-min reminder job error', { error: err.message });
    }
  });

  logger.info('10-min expiry reminder cron job scheduled (*/1 * * * *)');
};

module.exports = {
  cleanupExpiredSubscriptions,
  startSubscriptionCleanupJob,
  startRenewalReminderJob,
  startTrainerDailyEmailJob,
  startTenMinuteReminderJob,
};
