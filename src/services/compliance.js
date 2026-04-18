/**
 * GDPR/HIPAA Compliance Service — aggregator.
 * Composes focused modules (consent, data-rights, retention, breach) into the
 * same singleton surface previously exposed by this file. All consumers
 * (`routes/gdpr.js`, `services/monitoring.js`) keep calling `complianceService.foo()`.
 */

const consent = require('./compliance/consent');
const dataRights = require('./compliance/data-rights');
const retention = require('./compliance/retention');
const breach = require('./compliance/breach');
const monitoringService = require('./monitoring');

class ComplianceService {
  constructor() {
    this.logger = monitoringService.logger;
  }

  // Consent
  getConsentStatus(userId) {
    return consent.getConsentStatus(userId);
  }
  grantDataProcessingConsent(userId, ipAddress, userAgent) {
    return consent.grantDataProcessingConsent(userId, ipAddress, userAgent);
  }
  grantHealthDataConsent(userId, purpose, ipAddress, userAgent) {
    return consent.grantHealthDataConsent(userId, purpose, ipAddress, userAgent);
  }
  grantMarketingConsent(userId, ipAddress, userAgent) {
    return consent.grantMarketingConsent(userId, ipAddress, userAgent);
  }
  withdrawMarketingConsent(userId, ipAddress, userAgent) {
    return consent.withdrawMarketingConsent(userId, ipAddress, userAgent);
  }
  withdrawConsent(userId, consentType, ipAddress, userAgent) {
    return consent.withdrawConsent(userId, consentType, ipAddress, userAgent);
  }

  // Data subject rights
  requestDataAccess(userId, ipAddress, userAgent) {
    return dataRights.requestDataAccess(userId, ipAddress, userAgent);
  }
  requestDataRectification(userId, rectificationData, ipAddress, userAgent) {
    return dataRights.requestDataRectification(
      userId,
      rectificationData,
      ipAddress,
      userAgent
    );
  }
  requestDataErasure(userId, reason, ipAddress, userAgent) {
    return dataRights.requestDataErasure(userId, reason, ipAddress, userAgent);
  }
  requestDataPortability(userId, ipAddress, userAgent) {
    return dataRights.requestDataPortability(userId, ipAddress, userAgent);
  }
  objectToProcessing(userId, reason, ipAddress, userAgent) {
    return dataRights.objectToProcessing(userId, reason, ipAddress, userAgent);
  }
  requestProcessingRestriction(userId, reason, ipAddress, userAgent) {
    return dataRights.requestProcessingRestriction(userId, reason, ipAddress, userAgent);
  }

  // Retention
  performDataRetentionCleanup() {
    return retention.performDataRetentionCleanup();
  }

  // Breach
  logDataBreach(breachId, event, details) {
    return breach.logDataBreach(breachId, event, details);
  }
  isGdprNotificationRequired(event, details) {
    return breach.isGdprNotificationRequired(event, details);
  }
  isHipaaNotificationRequired(event, details) {
    return breach.isHipaaNotificationRequired(event, details);
  }
}

module.exports = new ComplianceService();
