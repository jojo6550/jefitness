const User = require('../../models/User');
const UserActionLog = require('../../models/UserActionLog');
const monitoringService = require('../monitoring');
const { logUserAction } = require('../logger');

const logger = monitoringService.logger;

/**
 * Check if GDPR notification is required for a given breach event.
 */
function isGdprNotificationRequired(event, details) {
  const personalDataEvents = [
    'unauthorized_access',
    'data_breach',
    'personal_data_compromised',
  ];

  return (
    personalDataEvents.includes(event) &&
    (details.personalData || details.affectedUsers > 0)
  );
}

/**
 * Check if HIPAA notification is required for a given breach event.
 */
function isHipaaNotificationRequired(event, details) {
  const phiEvents = ['health_data_breach', 'medical_records_compromised'];

  return phiEvents.includes(event) || (details.healthData && details.affectedUsers > 0);
}

/**
 * Log a data breach event against the compliance system and any affected users.
 */
async function logDataBreach(breachId, event, details) {
  try {
    logger.error('DATA BREACH LOGGED', {
      breachId,
      event,
      details,
      timestamp: new Date().toISOString(),
      compliance: {
        gdpr_notification_required: isGdprNotificationRequired(event, details),
        hipaa_notification_required: isHipaaNotificationRequired(event, details),
        affected_data_subjects: details.affectedUsers || 0,
      },
    });

    if (details.affectedUserIds && details.affectedUserIds.length > 0) {
      const logPromises = details.affectedUserIds.map(userId =>
        UserActionLog.logAction(userId, 'data_breach_affected', null, null, {
          breachId,
          event,
          affected: true,
        })
      );

      const users = await User.find({ _id: { $in: details.affectedUserIds } })
        .select('firstName lastName email')
        .lean();
      const userMap = {};
      users.forEach(user => {
        userMap[user._id] = user;
      });

      const appLogPromises = details.affectedUserIds.map(userId => {
        const user = userMap[userId];
        return logUserAction('data_breach_affected', userId, {
          userName:
            user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : 'Unknown',
          userEmail: user?.email || 'Unknown',
          breachId,
          event,
        });
      });

      await Promise.all([...logPromises, ...appLogPromises]);
    }

    return {
      success: true,
      breachId,
      logged: true,
    };
  } catch (error) {
    logger.error('Failed to log data breach', { error: error.message, breachId });
    throw error;
  }
}

module.exports = {
  isGdprNotificationRequired,
  isHipaaNotificationRequired,
  logDataBreach,
};
