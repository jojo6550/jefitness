const User = require('../../models/User');
const monitoringService = require('../monitoring');

const logger = monitoringService.logger;

/**
 * Perform data retention cleanup — anonymize users inactive beyond the retention period
 * who no longer hold any consent.
 */
async function performDataRetentionCleanup() {
  try {
    const retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years in ms
    const cutoffDate = new Date(Date.now() - retentionPeriod);

    const usersToCleanup = await User.find({
      lastLoggedIn: { $lt: cutoffDate },
      'dataProcessingConsent.given': false,
      'healthDataConsent.given': false,
      'marketingConsent.given': false,
      deletedAt: { $exists: false },
    });

    let cleanupCount = 0;

    for (const user of usersToCleanup) {
      await User.findByIdAndUpdate(user._id, {
        firstName: '[REDACTED]',
        lastName: '[REDACTED]',
        email: `[REDACTED-${user._id.slice(-6)}]@redacted.local`,
        phone: null,
        medicalConditions: null,
        goals: null,
        reason: null,
        nutritionLogs: [],
        sleepLogs: [],
        medicalDocuments: [],
        deletedAt: new Date(),
        $push: {
          auditLog: {
            action: 'data_retention_cleanup',
            timestamp: new Date(),
            details: { reason: 'retention_period_expired' },
          },
        },
      });

      cleanupCount++;
    }

    logger.info('Data retention cleanup completed', {
      usersProcessed: cleanupCount,
    });

    return {
      success: true,
      message: `Data retention cleanup completed. ${cleanupCount} user records anonymized.`,
      usersProcessed: cleanupCount,
    };
  } catch (error) {
    logger.error('Failed to perform data retention cleanup', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  performDataRetentionCleanup,
};
