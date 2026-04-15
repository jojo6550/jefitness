const cron = require('node-cron');

const { logger } = require('./services/logger');
const { sendTrainerDailySchedule } = require('./services/email');
const Appointment = require('./models/Appointment');

/**
 * Trainer daily schedule emails - UNCHANGED (only remaining job)
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
    }
  });

  logger.info('Trainer email cron scheduled (0 4 * * *)');
};

module.exports = { startTrainerDailyEmailJob };

