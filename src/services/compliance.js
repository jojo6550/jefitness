const User = require('../models/User');
const monitoringService = require('./monitoring');

/**
 * GDPR/HIPAA Compliance Service
 * Handles data subject rights, consent management, and compliance operations
 */
class ComplianceService {
  constructor() {
    this.logger = monitoringService.logger;
  }

  /**
   * Get user's consent status
   */
  async getConsentStatus(userId) {
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
          marketingConsent: user.marketingConsent
        }
      };
    } catch (error) {
      this.logger.error('Failed to get consent status', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Grant data processing consent
   */
  async grantDataProcessingConsent(userId, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataProcessingConsent.given': true,
        'dataProcessingConsent.givenAt': new Date(),
        'dataProcessingConsent.ipAddress': ipAddress,
        'dataProcessingConsent.userAgent': userAgent,
        $push: {
          auditLog: {
            action: 'data_processing_consent_granted',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { consentType: 'data_processing' }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      this.logger.info('Data processing consent granted', { userId, ipAddress });

      return {
        success: true,
        message: 'Data processing consent granted successfully',
        data: user.dataProcessingConsent
      };
    } catch (error) {
      this.logger.error('Failed to grant data processing consent', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Grant health data processing consent
   */
  async grantHealthDataConsent(userId, purpose, ipAddress, userAgent) {
    try {
      const updateData = {
        'healthDataConsent.given': true,
        'healthDataConsent.givenAt': new Date(),
        'healthDataConsent.purpose': purpose,
        'healthDataConsent.ipAddress': ipAddress,
        'healthDataConsent.userAgent': userAgent,
        $push: {
          auditLog: {
            action: 'health_data_consent_granted',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { consentType: 'health_data', purpose }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      this.logger.info('Health data consent granted', { userId, purpose, ipAddress });

      return {
        success: true,
        message: 'Health data processing consent granted successfully',
        data: user.healthDataConsent
      };
    } catch (error) {
      this.logger.error('Failed to grant health data consent', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId, consentType, ipAddress, userAgent) {
    try {
      let updateData = {
        $push: {
          auditLog: {
            action: 'consent_withdrawn',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { consentType }
          }
        }
      };

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

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      this.logger.info('Consent withdrawn', { userId, consentType, ipAddress });

      return {
        success: true,
        message: `${consentType} consent withdrawn successfully`
      };
    } catch (error) {
      this.logger.error('Failed to withdraw consent', { error: error.message, userId, consentType });
      throw error;
    }
  }

  /**
   * Request data access (GDPR Article 15)
   */
  async requestDataAccess(userId, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.accessRequested': true,
        'dataSubjectRights.accessRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'data_access_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'access' }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, this would trigger a process to collect and provide user data
      // For now, we'll mark it as provided immediately for demo purposes
      await User.findByIdAndUpdate(userId, {
        'dataSubjectRights.accessProvidedAt': new Date()
      });

      this.logger.info('Data access requested', { userId, ipAddress });

      return {
        success: true,
        message: 'Data access request submitted successfully. You will receive your data within 30 days.',
        requestId: `ACCESS-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to request data access', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Request data rectification (GDPR Article 16)
   */
  async requestDataRectification(userId, rectificationData, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.rectificationRequested': true,
        'dataSubjectRights.rectificationRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'data_rectification_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'rectification', rectificationData }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, this would trigger a manual review process
      this.logger.info('Data rectification requested', { userId, rectificationData, ipAddress });

      return {
        success: true,
        message: 'Data rectification request submitted successfully. Your request will be reviewed within 30 days.',
        requestId: `RECT-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to request data rectification', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Request data erasure (GDPR Article 17 - Right to be Forgotten)
   */
  async requestDataErasure(userId, reason, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.erasureRequested': true,
        'dataSubjectRights.erasureRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'data_erasure_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'erasure', reason }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, this would trigger a data anonymization/deletion process
      // For demo purposes, we'll simulate completion
      await User.findByIdAndUpdate(userId, {
        'dataSubjectRights.erasureCompletedAt': new Date(),
        deletedAt: new Date(),
        firstName: '[DELETED]',
        lastName: '[DELETED]',
        email: `[DELETED-${userId.slice(-6)}]@deleted.local`
      });

      this.logger.info('Data erasure requested', { userId, reason, ipAddress });

      return {
        success: true,
        message: 'Data erasure request submitted successfully. Your data will be anonymized within 30 days.',
        requestId: `ERASE-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to request data erasure', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Request data portability (GDPR Article 20)
   */
  async requestDataPortability(userId, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.portabilityRequested': true,
        'dataSubjectRights.portabilityRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'data_portability_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'portability' }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, this would generate and provide a data export
      // For demo purposes, we'll mark it as completed
      await User.findByIdAndUpdate(userId, {
        'dataSubjectRights.portabilityCompletedAt': new Date()
      });

      this.logger.info('Data portability requested', { userId, ipAddress });

      return {
        success: true,
        message: 'Data portability request submitted successfully. You will receive your data export within 30 days.',
        requestId: `PORT-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to request data portability', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Object to processing (GDPR Article 21)
   */
  async objectToProcessing(userId, reason, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.objectionRequested': true,
        'dataSubjectRights.objectionRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'processing_objection_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'objection', reason }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      this.logger.info('Processing objection requested', { userId, reason, ipAddress });

      return {
        success: true,
        message: 'Processing objection submitted successfully. Your request will be reviewed within 30 days.',
        requestId: `OBJ-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to object to processing', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Request processing restriction (GDPR Article 18)
   */
  async requestProcessingRestriction(userId, reason, ipAddress, userAgent) {
    try {
      const updateData = {
        'dataSubjectRights.restrictionRequested': true,
        'dataSubjectRights.restrictionRequestedAt': new Date(),
        $push: {
          auditLog: {
            action: 'processing_restriction_requested',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: { right: 'restriction', reason }
          }
        }
      };

      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (!user) {
        throw new Error('User not found');
      }

      this.logger.info('Processing restriction requested', { userId, reason, ipAddress });

      return {
        success: true,
        message: 'Processing restriction request submitted successfully. Your request will be reviewed within 30 days.',
        requestId: `REST-${Date.now()}-${userId.slice(-6)}`
      };
    } catch (error) {
      this.logger.error('Failed to request processing restriction', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Perform data retention cleanup
   */
  async performDataRetentionCleanup() {
    try {
      const retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years in milliseconds
      const cutoffDate = new Date(Date.now() - retentionPeriod);

      // Find users who haven't logged in for 7 years and don't have active consents
      const usersToCleanup = await User.find({
        lastLoggedIn: { $lt: cutoffDate },
        'dataProcessingConsent.given': false,
        'healthDataConsent.given': false,
        'marketingConsent.given': false,
        deletedAt: { $exists: false }
      });

      let cleanupCount = 0;

      for (const user of usersToCleanup) {
        // Anonymize user data
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
              details: { reason: 'retention_period_expired' }
            }
          }
        });

        cleanupCount++;
      }

      this.logger.info('Data retention cleanup completed', { usersProcessed: cleanupCount });

      return {
        success: true,
        message: `Data retention cleanup completed. ${cleanupCount} user records anonymized.`,
        usersProcessed: cleanupCount
      };
    } catch (error) {
      this.logger.error('Failed to perform data retention cleanup', { error: error.message });
      throw error;
    }
  }

  /**
   * Log data breach in compliance system
   */
  async logDataBreach(breachId, event, details) {
    try {
      // Create a compliance breach log entry
      // In a real implementation, this would be stored in a separate compliance database
      this.logger.error('DATA BREACH LOGGED', {
        breachId,
        event,
        details,
        timestamp: new Date().toISOString(),
        compliance: {
          gdpr_notification_required: this.isGdprNotificationRequired(event, details),
          hipaa_notification_required: this.isHipaaNotificationRequired(event, details),
          affected_data_subjects: details.affectedUsers || 0
        }
      });

      // If this affects users in the system, log it in their audit trails
      if (details.affectedUserIds && details.affectedUserIds.length > 0) {
        const auditEntry = {
          action: 'data_breach_affected',
          timestamp: new Date(),
          details: {
            breachId,
            event,
            affected: true
          }
        };

        await User.updateMany(
          { _id: { $in: details.affectedUserIds } },
          { $push: { auditLog: auditEntry } }
        );
      }

      return {
        success: true,
        breachId,
        logged: true
      };
    } catch (error) {
      this.logger.error('Failed to log data breach', { error: error.message, breachId });
      throw error;
    }
  }

  /**
   * Check if GDPR notification is required
   */
  isGdprNotificationRequired(event, details) {
    // GDPR requires notification within 72 hours for breaches affecting personal data
    const personalDataEvents = [
      'unauthorized_access',
      'data_breach',
      'personal_data_compromised'
    ];

    return personalDataEvents.includes(event) &&
           (details.personalData || details.affectedUsers > 0);
  }

  /**
   * Check if HIPAA notification is required
   */
  isHipaaNotificationRequired(event, details) {
    // HIPAA requires notification for breaches of unsecured PHI
    const phiEvents = [
      'health_data_breach',
      'medical_records_compromised'
    ];

    return phiEvents.includes(event) ||
           (details.healthData && details.affectedUsers > 0);
  }
}

module.exports = new ComplianceService();
