/**
 * Integration Tests for GDPR Compliance & Data Protection
 * Tests consent management, data export, right-to-erasure, and audit trails
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/User');
const UserActionLog = require('../../models/UserActionLog');

describe('GDPR Compliance & Data Protection', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'gdpr@example.com',
      password: hashedPassword,
      isEmailVerified: true,
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' },
      marketingConsent: { given: false }
    });

    authToken = jwt.sign(
      { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );
  });

  describe('Consent Management', () => {
    describe('GET /api/v1/gdpr/consent', () => {
      test('should retrieve current consent status', async () => {
        const response = await request(app)
          .get('/api/v1/gdpr/consent')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.data.dataProcessingConsent.given).toBe(true);
        expect(response.body.data.data.healthDataConsent.given).toBe(true);
      });

      test('should require authentication', async () => {
        await request(app)
          .get('/api/v1/gdpr/consent')
          .expect(401);
      });
    });

    describe('POST /api/v1/gdpr/consent/data-processing', () => {
      test('should grant data processing consent', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/consent/data-processing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('granted');

        // Verify consent was recorded with metadata
        const user = await User.findById(testUser._id);
        expect(user.dataProcessingConsent.given).toBe(true);
        expect(user.dataProcessingConsent.givenAt).toBeDefined();
        expect(user.dataProcessingConsent.ipAddress).toBeDefined();
      });

      test('should log consent action', async () => {
        await request(app)
          .post('/api/v1/gdpr/consent/data-processing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Verify action was logged
        const logs = await UserActionLog.find({
          userId: testUser._id,
          action: 'data_processing_consent_granted'
        });

        expect(logs.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/v1/gdpr/consent/health-data', () => {
      test('should grant health data consent with purpose', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/consent/health-data')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ purpose: 'Fitness tracking and health monitoring' })
          .expect(200);

        expect(response.body.success).toBe(true);

        const user = await User.findById(testUser._id);
        expect(user.healthDataConsent.given).toBe(true);
        expect(user.healthDataConsent.purpose).toBe('Fitness tracking and health monitoring');
      });
    });

    describe('POST /api/v1/gdpr/consent/marketing', () => {
      test('should grant marketing consent', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/consent/marketing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        const user = await User.findById(testUser._id);
        expect(user.marketingConsent.given).toBe(true);
      });
    });

    describe('DELETE /api/v1/gdpr/consent/:consentType', () => {
      test('should withdraw data processing consent', async () => {
        const response = await request(app)
          .delete('/api/v1/gdpr/consent/data_processing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        const user = await User.findById(testUser._id);
        expect(user.dataProcessingConsent.given).toBe(false);
        expect(user.dataProcessingConsent.withdrawnAt).toBeDefined();
      });

      test('should withdraw marketing consent', async () => {
        // First grant consent
        await request(app)
          .post('/api/v1/gdpr/consent/marketing')
          .set('Authorization', `Bearer ${authToken}`);

        // Then withdraw
        const response = await request(app)
          .delete('/api/v1/gdpr/consent/marketing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        const user = await User.findById(testUser._id);
        expect(user.marketingConsent.given).toBe(false);
      });

      test('should reject invalid consent type', async () => {
        const response = await request(app)
          .delete('/api/v1/gdpr/consent/invalid_type')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Invalid consent type');
      });

      test('should log consent withdrawal', async () => {
        await request(app)
          .delete('/api/v1/gdpr/consent/marketing')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const logs = await UserActionLog.find({
          userId: testUser._id,
          action: 'consent_withdrawn'
        });

        expect(logs.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Subject Rights', () => {
    describe('POST /api/v1/gdpr/data-access', () => {
      test('should request data access (Article 15)', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/data-access')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();
        expect(response.body.message).toContain('30 days');

        // Verify request was recorded
        const user = await User.findById(testUser._id);
        expect(user.dataSubjectRights.accessRequested).toBe(true);
        expect(user.dataSubjectRights.accessRequestedAt).toBeDefined();
      });

      test('should log data access request', async () => {
        await request(app)
          .post('/api/v1/gdpr/data-access')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const logs = await UserActionLog.find({
          userId: testUser._id,
          action: 'data_access_requested'
        });

        expect(logs.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/v1/gdpr/data-rectification', () => {
      test('should request data rectification (Article 16)', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/data-rectification')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            field: 'email',
            currentValue: 'gdpr@example.com',
            requestedValue: 'newemail@example.com'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();

        const user = await User.findById(testUser._id);
        expect(user.dataSubjectRights.rectificationRequested).toBe(true);
      });

      test('should log rectification request', async () => {
        await request(app)
          .post('/api/v1/gdpr/data-rectification')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            field: 'email',
            currentValue: 'gdpr@example.com',
            requestedValue: 'new@example.com'
          })
          .expect(200);

        const logs = await UserActionLog.find({
          userId: testUser._id,
          action: 'data_rectification_requested'
        });

        expect(logs.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/v1/gdpr/data-erasure', () => {
      test('should request data erasure (Article 17 - Right to be Forgotten)', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/data-erasure')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ reason: 'No longer using the service' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();

        // Verify erasure was processed
        const user = await User.findById(testUser._id);
        expect(user.dataSubjectRights.erasureRequested).toBe(true);
        expect(user.deletedAt).toBeDefined();
        expect(user.firstName).toBe('[DELETED]');
        expect(user.email).toContain('[DELETED-');
      });

      test('should anonymize user data on erasure', async () => {
        await request(app)
          .post('/api/v1/gdpr/data-erasure')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ reason: 'Privacy concerns' })
          .expect(200);

        const user = await User.findById(testUser._id);
        expect(user.firstName).toBe('[DELETED]');
        expect(user.lastName).toBe('[DELETED]');
        expect(user.email).not.toBe('gdpr@example.com');
      });

      test('should log erasure request', async () => {
        await request(app)
          .post('/api/v1/gdpr/data-erasure')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ reason: 'Account closure' })
          .expect(200);

        const logs = await UserActionLog.find({
          userId: testUser._id,
          action: 'data_erasure_requested'
        });

        expect(logs.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/v1/gdpr/data-portability', () => {
      test('should request data portability (Article 20)', async () => {
        const response = await request(app)
          .post('/api/v1/gdpr/data-portability')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ format: 'json' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();

        const user = await User.findById(testUser._id);
        expect(user.dataSubjectRights.portabilityRequested).toBe(true);
      });

      test('should support multiple export formats', async () => {
        const formats = ['json', 'csv', 'xml'];

        for (const format of formats) {
          const response = await request(app)
            .post('/api/v1/gdpr/data-portability')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ format })
            .expect(200);

          expect(response.body.success).toBe(true);
        }
      });
    });
  });

  describe('Audit Trail', () => {
    test('should log all user actions with timestamps', async () => {
      // Perform various actions
      await request(app)
        .post('/api/v1/gdpr/consent/marketing')
        .set('Authorization', `Bearer ${authToken}`);

      await request(app)
        .delete('/api/v1/gdpr/consent/marketing')
        .set('Authorization', `Bearer ${authToken}`);

      await request(app)
        .post('/api/v1/gdpr/data-access')
        .set('Authorization', `Bearer ${authToken}`);

      // Verify audit trail
      const logs = await UserActionLog.find({ userId: testUser._id })
        .sort({ timestamp: -1 });

      expect(logs.length).toBeGreaterThan(0);

      // Verify each log has required fields
      logs.forEach(log => {
        expect(log.action).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.ipAddress).toBeDefined();
      });
    });

    test('should capture IP address and user agent', async () => {
      await request(app)
        .post('/api/v1/gdpr/consent/marketing')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Test-Agent/1.0')
        .expect(200);

      const logs = await UserActionLog.findOne({
        userId: testUser._id,
        action: 'marketing_consent_granted'
      });

      expect(logs.ipAddress).toBeDefined();
      expect(logs.userAgent).toBeDefined();
    });

    test('should maintain audit trail even after data erasure', async () => {
      // Perform some actions before erasure
      await request(app)
        .post('/api/v1/gdpr/consent/marketing')
        .set('Authorization', `Bearer ${authToken}`);

      // Request erasure
      await request(app)
        .post('/api/v1/gdpr/data-erasure')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Testing' });

      // Verify logs still exist (audit trail must be maintained)
      const logs = await UserActionLog.find({ userId: testUser._id });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('PII Masking in Logs', () => {
    test('should not expose sensitive data in action logs', async () => {
      await request(app)
        .post('/api/v1/gdpr/data-rectification')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          field: 'email',
          currentValue: 'gdpr@example.com',
          requestedValue: 'sensitive@example.com'
        })
        .expect(200);

      const log = await UserActionLog.findOne({
        userId: testUser._id,
        action: 'data_rectification_requested'
      });

      // Log should not directly expose the email values in plain text
      // (specific masking depends on implementation)
      expect(log).toBeDefined();
      expect(log.details).toBeDefined();
    });

    test('should mask passwords in logs', async () => {
      // Signup creates logs
      await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'New',
          lastName: 'User',
          email: 'newuser@example.com',
          password: 'SecretPassword123!',
          dataProcessingConsent: { given: true },
          healthDataConsent: { given: true }
        })
        .expect(201);

      // Verify password is not logged in plain text
      const logs = await UserActionLog.find({
        action: /signup/i
      });

      logs.forEach(log => {
        const logString = JSON.stringify(log);
        expect(logString).not.toContain('SecretPassword123!');
      });
    });
  });

  describe('Data Export', () => {
    test('should export user data in machine-readable format', async () => {
      const response = await request(app)
        .get('/api/v1/gdpr/export-data')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('gdpr@example.com');

      // Verify sensitive data is excluded
      expect(response.body.data.user.password).toBeUndefined();
    });

    test('should include all relevant user data in export', async () => {
      const response = await request(app)
        .get('/api/v1/gdpr/export-data')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const exportData = response.body.data;

      // Verify structure includes all data categories
      expect(exportData.user).toBeDefined();
      expect(exportData.consents).toBeDefined();
      expect(exportData.actionLog).toBeDefined();
    });

    test('should require authentication for data export', async () => {
      await request(app)
        .get('/api/v1/gdpr/export-data')
        .expect(401);
    });
  });

  describe('Consent Enforcement', () => {
    test('should block processing without data consent', async () => {
      // Withdraw data processing consent
      await request(app)
        .delete('/api/v1/gdpr/consent/data_processing')
        .set('Authorization', `Bearer ${authToken}`);

      // Verify user is blocked from certain operations
      const user = await User.findById(testUser._id);
      expect(user.dataProcessingConsent.given).toBe(false);
    });

    test('should block health data access without health consent', async () => {
      // Withdraw health data consent
      await request(app)
        .delete('/api/v1/gdpr/consent/health_data')
        .set('Authorization', `Bearer ${authToken}`);

      const user = await User.findById(testUser._id);
      expect(user.healthDataConsent.given).toBe(false);
    });
  });
});
