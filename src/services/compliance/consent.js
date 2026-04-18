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
 * Get user's consent status
 */
async function getConsentStatus(userId) {
  try {
    const user = await User.findById(userId)
      .select('dataProcessingConsent healthDataConsent marketingConsent')
      .lean();

    if (!user) {
      throw new Error('User not found');
    }

    return {
      success: true,
      data: {
        dataProcessingConsent: user.dataProcessingConsent,
        healthDataConsent: user.healthDataConsent,
        marketingConsent: user.marketingConsent,
      },
    };
  } catch (error) {
    logger.error('Failed to get consent status', { error: error.message, userId });
    throw error;
  }
}

/**
 * Grant data processing consent
 */
async function grantDataProcessingConsent(userId, ipAddress, userAgent) {
  try {
    const updateData = {
      'dataProcessingConsent.given': true,
      'dataProcessingConsent.givenAt': new Date(),
      'dataProcessingConsent.ipAddress': ipAddress,
      'dataProcessingConsent.userAgent': userAgent,
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'data_processing_consent_granted',
      ipAddress,
      userAgent,
      {
        consentType: 'data_processing',
      }
    );
    logUserAction('data_processing_consent_granted', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      consentType: 'data_processing',
      ipAddress,
    });

    logger.info('Data processing consent granted', { userId, ipAddress });

    return {
      success: true,
      message: 'Data processing consent granted successfully',
      data: user.dataProcessingConsent,
    };
  } catch (error) {
    logger.error('Failed to grant data processing consent', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Grant health data processing consent
 */
async function grantHealthDataConsent(userId, purpose, ipAddress, userAgent) {
  try {
    const updateData = {
      'healthDataConsent.given': true,
      'healthDataConsent.givenAt': new Date(),
      'healthDataConsent.purpose': purpose,
      'healthDataConsent.ipAddress': ipAddress,
      'healthDataConsent.userAgent': userAgent,
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'health_data_consent_granted',
      ipAddress,
      userAgent,
      {
        consentType: 'health_data',
        purpose,
      }
    );
    logUserAction('health_data_consent_granted', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      consentType: 'health_data',
      purpose,
      ipAddress,
    });

    logger.info('Health data consent granted', { userId, purpose, ipAddress });

    return {
      success: true,
      message: 'Health data processing consent granted successfully',
      data: user.healthDataConsent,
    };
  } catch (error) {
    logger.error('Failed to grant health data consent', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Grant marketing consent
 */
async function grantMarketingConsent(userId, ipAddress, userAgent) {
  try {
    const updateData = {
      'marketingConsent.given': true,
      'marketingConsent.givenAt': new Date(),
      'marketingConsent.withdrawnAt': null,
      'marketingConsent.ipAddress': ipAddress,
      'marketingConsent.userAgent': userAgent,
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'marketing_consent_granted',
      ipAddress,
      userAgent,
      {
        consentType: 'marketing',
      }
    );
    logUserAction('marketing_consent_granted', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      consentType: 'marketing',
      ipAddress,
    });

    logger.info('Marketing consent granted', { userId, ipAddress });

    return {
      success: true,
      message: 'Marketing consent granted successfully',
      data: user.marketingConsent,
    };
  } catch (error) {
    logger.error('Failed to grant marketing consent', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Withdraw marketing consent
 */
async function withdrawMarketingConsent(userId, ipAddress, userAgent) {
  try {
    const updateData = {
      'marketingConsent.given': false,
      'marketingConsent.withdrawnAt': new Date(),
    };

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(
      userId,
      'marketing_consent_withdrawn',
      ipAddress,
      userAgent,
      {
        consentType: 'marketing',
      }
    );
    logUserAction('marketing_consent_withdrawn', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      consentType: 'marketing',
      ipAddress,
    });

    logger.info('Marketing consent withdrawn', { userId, ipAddress });

    return {
      success: true,
      message: 'Marketing consent withdrawn successfully',
    };
  } catch (error) {
    logger.error('Failed to withdraw marketing consent', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Withdraw consent by type
 */
async function withdrawConsent(userId, consentType, ipAddress, userAgent) {
  try {
    const updateData = {};

    switch (consentType) {
      case 'data_processing':
        updateData['dataProcessingConsent.given'] = false;
        break;
      case 'health_data':
        updateData['healthDataConsent.given'] = false;
        break;
      case 'marketing':
        updateData['marketingConsent.given'] = false;
        updateData['marketingConsent.withdrawnAt'] = new Date();
        break;
      default:
        throw new Error('Invalid consent type');
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      'firstName lastName email'
    );

    if (!user) {
      throw new Error('User not found');
    }

    await UserActionLog.logAction(userId, 'consent_withdrawn', ipAddress, userAgent, {
      consentType,
    });
    logUserAction('consent_withdrawn', userId, {
      userName: userDisplayName(user),
      userEmail: user?.email || 'Unknown',
      consentType,
      ipAddress,
    });

    logger.info('Consent withdrawn', { userId, consentType, ipAddress });

    return {
      success: true,
      message: `${consentType} consent withdrawn successfully`,
    };
  } catch (error) {
    logger.error('Failed to withdraw consent', {
      error: error.message,
      userId,
      consentType,
    });
    throw error;
  }
}

module.exports = {
  getConsentStatus,
  grantDataProcessingConsent,
  grantHealthDataConsent,
  grantMarketingConsent,
  withdrawMarketingConsent,
  withdrawConsent,
};
