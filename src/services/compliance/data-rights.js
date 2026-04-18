const User = require('../../models/User');
const UserActionLog = require('../../models/UserActionLog');
const monitoringService = require('../monitoring');
const { logUserAction } = require('../logger');

const logger = monitoringService.logger;

function userDisplayName(user) {
  return user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : 'Unknown';
}

/**
 * Request data access (GDPR Article 15)
 */
async function requestDataAccess(userId, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.accessRequested': true,
      'dataSubjectRights.accessRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(userId, 'data_access_requested', ipAddress, userAgent, {
      right: 'access',
    });
    logUserAction('data_access_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'access',
      ipAddress,
    });

    await User.findByIdAndUpdate(userId, {
      'dataSubjectRights.accessProvidedAt': new Date(),
    });

    logger.info('Data access requested', { userId, ipAddress });

    return {
      success: true,
      message:
        'Data access request submitted successfully. You will receive your data within 30 days.',
      requestId: `ACCESS-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to request data access', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Request data rectification (GDPR Article 16)
 */
async function requestDataRectification(userId, rectificationData, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.rectificationRequested': true,
      'dataSubjectRights.rectificationRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'data_rectification_requested',
      ipAddress,
      userAgent,
      {
        right: 'rectification',
        rectificationData,
      }
    );
    logUserAction('data_rectification_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'rectification',
      ipAddress,
    });

    logger.info('Data rectification requested', {
      userId,
      rectificationData,
      ipAddress,
    });

    return {
      success: true,
      message:
        'Data rectification request submitted successfully. Your request will be reviewed within 30 days.',
      requestId: `RECT-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to request data rectification', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Request data erasure (GDPR Article 17 - Right to be Forgotten)
 */
async function requestDataErasure(userId, reason, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.erasureRequested': true,
      'dataSubjectRights.erasureRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'data_erasure_requested',
      ipAddress,
      userAgent,
      {
        right: 'erasure',
        reason,
      }
    );
    logUserAction('data_erasure_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'erasure',
      reason,
      ipAddress,
    });

    await User.findByIdAndUpdate(userId, {
      'dataSubjectRights.erasureCompletedAt': new Date(),
      deletedAt: new Date(),
      firstName: '[DELETED]',
      lastName: '[DELETED]',
      email: `[DELETED-${userId.slice(-6)}]@deleted.local`,
    });

    logger.info('Data erasure requested', { userId, reason, ipAddress });

    return {
      success: true,
      message:
        'Data erasure request submitted successfully. Your data will be anonymized within 30 days.',
      requestId: `ERASE-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to request data erasure', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Request data portability (GDPR Article 20)
 */
async function requestDataPortability(userId, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.portabilityRequested': true,
      'dataSubjectRights.portabilityRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'data_portability_requested',
      ipAddress,
      userAgent,
      {
        right: 'portability',
      }
    );
    logUserAction('data_portability_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'portability',
      ipAddress,
    });

    await User.findByIdAndUpdate(userId, {
      'dataSubjectRights.portabilityCompletedAt': new Date(),
    });

    logger.info('Data portability requested', { userId, ipAddress });

    return {
      success: true,
      message:
        'Data portability request submitted successfully. You will receive your data export within 30 days.',
      requestId: `PORT-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to request data portability', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Object to processing (GDPR Article 21)
 */
async function objectToProcessing(userId, reason, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.objectionRequested': true,
      'dataSubjectRights.objectionRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'processing_objection_requested',
      ipAddress,
      userAgent,
      {
        right: 'objection',
        reason,
      }
    );
    logUserAction('processing_objection_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'objection',
      reason,
      ipAddress,
    });

    logger.info('Processing objection requested', { userId, reason, ipAddress });

    return {
      success: true,
      message:
        'Processing objection submitted successfully. Your request will be reviewed within 30 days.',
      requestId: `OBJ-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to object to processing', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Request processing restriction (GDPR Article 18)
 */
async function requestProcessingRestriction(userId, reason, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataSubjectRights.restrictionRequested': true,
      'dataSubjectRights.restrictionRequestedAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'processing_restriction_requested',
      ipAddress,
      userAgent,
      {
        right: 'restriction',
        reason,
      }
    );
    logUserAction('processing_restriction_requested', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      right: 'restriction',
      reason,
      ipAddress,
    });

    logger.info('Processing restriction requested', { userId, reason, ipAddress });

    return {
      success: true,
      message:
        'Processing restriction request submitted successfully. Your request will be reviewed within 30 days.',
      requestId: `REST-${Date.now()}-${userId.slice(-6)}`,
    };
  } catch (error) {
    logger.error('Failed to request processing restriction', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

module.exports = {
  requestDataAccess,
  requestDataRectification,
  requestDataErasure,
  requestDataPortability,
  objectToProcessing,
  requestProcessingRestriction,
};
