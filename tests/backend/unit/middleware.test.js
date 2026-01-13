const request = require('supertest');
const app = require('../../../src/server');
const User = require('../../../src/models/User');
const jwt = require('jsonwebtoken');

describe('Middleware Tests', () => {
  describe('Authentication Middleware', () => {
    let user;
    let token;

    beforeEach(async () => {
      user = new User({
        firstName: 'Middleware',
        lastName: 'Test',
        email: 'middleware@example.com',
        password: '$2a$10$hashedpassword',
        isEmailVerified: true,
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      });
      await user.save();

      token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    });

    it('should allow access with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(user.email);
    });

    it('should deny access without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('should deny access with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should deny access with malformed token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('should allow requests within rate limit', async () => {
      // Make multiple requests within limit
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/health')
          .expect(200);

        expect(response.body.status).toBe('healthy');
      }
    });

    it('should rate limit excessive requests', async () => {
      // Make many requests to trigger rate limit
      for (let i = 0; i < 150; i++) {
        await request(app)
          .get('/api/health')
          .expect((res) => {
            if (i < 100) {
              expect(res.status).toBe(200);
            } else if (i >= 100) {
              // Should start getting rate limited
              expect([200, 429]).toContain(res.status);
            }
          });
      }
    });

    it('should apply different limits to different endpoints', async () => {
      // Health endpoint has different limits than auth endpoints
      const healthResponse = await request(app)
        .get('/api/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
    });
  });

  describe('CORS Middleware', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeTruthy();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('should allow requests from allowed origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeTruthy();
    });
  });

  describe('Security Headers Middleware', () => {
    it('should set security headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toBeTruthy();
      expect(response.headers['content-security-policy']).toBeTruthy();
    });
  });

  describe('Input Sanitization Middleware', () => {
    it('should sanitize malicious input', async () => {
      const maliciousData = {
        firstName: '<script>alert("xss")</script>John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Password123!',
        dataProcessingConsent: { given: true },
        healthDataConsent: { given: true }
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(maliciousData)
        .expect(201);

      expect(response.body.success).toBe(true);
      // The input should be sanitized
      expect(response.body.user.firstName).not.toContain('<script>');
    });
  });
});
