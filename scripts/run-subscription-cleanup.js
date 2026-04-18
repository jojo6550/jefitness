const mongoose = require('mongoose');

const dotenv = require('dotenv');

const { logger } = require('../src/services/logger');
const Subscription = require('../src/models/Subscription');
const configDb = require('../config/db');
dotenv.config();

async function runCleanup() {
  try {
    await configDb();
    logger.info('Manual subscription cleanup started');

    const now = new Date();

    // Find past_due + expired
    const targets = await Subscription.find({
      status: { $in: ['active', 'past_due', 'trialing', 'paused'] },
      $or: [{ currentPeriodEnd: { $lt: now } }, { currentPeriodEnd: null }],
    });

    if (!targets.length) {
      logger.info('No subscriptions to clean');
      return;
    }

    logger.info(`Found ${targets.length} subscriptions to check`);

    let canceledCount = 0;
    for (const sub of targets) {
      // PLATFORM POLICY: past_due → canceled
      if (sub.status === 'past_due') {
        await Subscription.findByIdAndUpdate(
          sub._id,
          {
            $set: { status: 'canceled' },
            $push: {
              statusHistory: {
                status: 'canceled',
                changedAt: now,
                reason: 'Manual cleanup: past_due auto-cancel',
              },
            },
          },
          { runValidators: false }
        );
        logger.info('Past due canceled:', sub._id);
        canceledCount++;
        continue;
      }

      // Existing expiry logic...
      logger.info('Manual cleanup complete. Canceled:', canceledCount);
    }
  } catch (err) {
    logger.error('Cleanup failed:', err);
  } finally {
    mongoose.connection.close();
  }
}

runCleanup();
