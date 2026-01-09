# Security Implementation Guide

## Overview
This document outlines the security enhancements and best practices implemented in the JE Fitness application.

## Implemented Security Features

### 1. Authentication & Authorization

#### JWT Token Verification
- All protected routes require valid JWT tokens in Authorization header
- Token format: `Bearer <token>`
- Fallback support for `x-auth-token` header
- Server validates JWT secret on every request

#### Rate Limiting
- **General API**: 100 requests per 15 minutes per IP
- **Authentication Routes**: 5 attempts per 15 minutes per IP
- **Password Reset**: 3 attempts per hour per IP
- Returns standardized rate limit response headers

#### Session Management
- Request-based validation (no persistent sessions)
- Each request must include valid token
- Token expiration enforced via JWT library

### 2. Input Validation & Sanitization

#### Request Validation
- All inputs validated using express-validator
- Email: RFC-compliant validation with normalization
- Password: Minimum 8 characters, must include uppercase, lowercase, and numbers
- Phone: International format support (10-20 characters)
- URL: Protocol and domain validation
- Pagination: Limits enforced (1-100 items per page)

#### XSS Prevention
- HTML sanitization on all string inputs
- Script tag removal with sanitize-html
- Dangerous attributes stripped
- Special characters escaped in JSON responses

#### CSRF Protection
- Same-Site cookie attributes configured
- Origin validation on CORS requests
- POST/PUT/DELETE require specific content types

### 3. Security Headers

#### Helmet.js Configuration
- **Content Security Policy**: Restricts script and style sources
- **HSTS**: 1-year max age with subdomains and preload
- **X-Frame-Options**: DENY (prevents clickjacking)
- **X-Content-Type-Options**: nosniff (prevents MIME sniffing)
- **Referrer-Policy**: strict-origin-when-cross-origin
- **X-XSS-Protection**: Enabled for legacy browser support

#### Custom Security Headers
- **X-Request-Id**: Unique request tracking
- **Permissions-Policy**: Restricts camera, microphone, geolocation, USB
- **Cache-Control**: No-store for sensitive endpoints
- **X-Powered-By**: Removed to hide server info

### 4. CORS Security

#### Allowed Origins
- Development: localhost:3000, localhost:5500, localhost:5501
- Production: Configured via FRONTEND_URL and ALLOWED_ORIGINS env vars
- Credentials: Supported with explicit origin matching
- Methods: GET, POST, PUT, DELETE, PATCH (preflight-safe)

#### Preflight Handling
- OPTIONS requests handled with proper CORS headers
- Max-Age: 24 hours for preflight caching
- Exposed headers: Pagination and rate limit info

### 5. Error Handling

#### Error Logging
- All errors logged with context (user, IP, request ID)
- Security events logged separately with enhanced details
- Stack traces included in development mode only
- Unique error IDs for tracking and debugging

#### Error Response Format
```json
{
  "success": false,
  "error": {
    "id": "ERR_1234567890_abc123",
    "message": "Descriptive error message",
    "category": "validation|authentication|server",
    "requestId": "REQ_1234567890_abc123"
  }
}
```

### 6. Logging & Monitoring

#### Security Event Logging
- **Authentication events**: login, logout, failed attempts, account lockouts
- **Authorization events**: access denied, permission changes
- **Data access events**: sensitive data reads, exports
- **API key events**: creation, rotation, revocation, expiration

#### Request Logging
- Request ID generation for traceability
- Performance monitoring (logs requests > 1000ms)
- Sensitive endpoint tracking
- Failed authentication/authorization tracking

#### Audit Trail
- All security events stored in database
- Includes IP address, user agent, timestamp
- Metadata for context and investigation

### 7. Data Protection

#### Encryption at Rest
- Sensitive fields encrypted in MongoDB using mongoose-encryption
- User PII encrypted with encryption key
- API keys stored hashed

#### Data Validation
- Type checking on all inputs
- Schema validation at database level
- Mongoose schema enforcement

#### Password Security
- Bcrypt hashing with salt rounds
- Password strength requirements enforced
- Password history consideration (future enhancement)

### 8. API Key Management

#### Security Features
- Unique key generation per user
- Scoped permissions (read, write, admin)
- Expiration dates configurable (default 90 days)
- Rotation recommended every 60 days

#### Validation
- API keys validated on every request
- Expired keys rejected immediately
- Revoked keys not accepted

### 9. Database Security

#### Connection Security
- Connection pooling (max 10 connections)
- Timeout configuration (5000ms selection, 45000ms socket)
- IPv4 enforcement
- Error handling on disconnect

#### Query Optimization
- Slow query monitoring (logs queries > 100ms)
- Connection error handling
- Auto-reconnect capability

### 10. HTTPS/SSL Configuration

See [HTTPS_SETUP.md](./HTTPS_SETUP.md) for detailed setup instructions.

## Environment Variables

### Required for Security
```
JWT_SECRET=<strong-random-string>
ENCRYPTION_KEY=<32-character-key>
SESSION_SECRET=<random-string>
```

### Recommended for Production
```
NODE_ENV=production
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

## Security Best Practices

### For Developers
1. Always validate and sanitize user input
2. Use HTTPS in production
3. Keep dependencies updated: `npm audit`
4. Never commit secrets to version control
5. Use environment variables for sensitive config
6. Test security features regularly
7. Log security events appropriately

### For System Administrators
1. Keep Node.js updated to latest stable version
2. Monitor logs for suspicious patterns
3. Implement monitoring/alerting for security events
4. Regular security patches for dependencies
5. Database backups and recovery procedures
6. SSL certificate renewal before expiration
7. Review rate limiting thresholds based on usage

### For Users
1. Use strong, unique passwords (8+ chars, mixed case, numbers)
2. Enable 2FA when available
3. Keep devices updated
4. Use HTTPS (never HTTP for sensitive data)
5. Don't share API keys
6. Rotate API keys regularly

## Testing Security

### Manual Testing Checklist
- [ ] Invalid tokens rejected
- [ ] Rate limits enforced
- [ ] XSS payloads sanitized
- [ ] CORS blocks unauthorized origins
- [ ] SQL injection attempts blocked
- [ ] Password validation enforced
- [ ] HTTPS redirects working
- [ ] Security headers present
- [ ] Error messages don't leak sensitive info

### Automated Testing
Run security checks:
```bash
npm audit                    # Check for vulnerable dependencies
npm test                     # Run test suite
npm run test:security       # Run security-specific tests (future)
```

## Incident Response

### If a security breach is suspected:
1. Check logs for suspicious activity
2. Review access logs and failed authentication attempts
3. Check for unauthorized API key creation
4. Review data access patterns
5. Contact affected users if data exposed
6. Rotate compromised credentials
7. Update security patches immediately

## Future Enhancements

1. **Multi-Factor Authentication (MFA)**
   - TOTP implementation
   - SMS-based 2FA
   - Backup codes

2. **Advanced Monitoring**
   - Real-time alerting
   - Anomaly detection
   - Geo-blocking for suspicious locations

3. **Encryption Improvements**
   - Field-level encryption for more data types
   - Hardware security module (HSM) support

4. **Compliance**
   - GDPR implementation
   - HIPAA compliance (health data)
   - SOC 2 certification readiness

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [Helmet.js Documentation](https://helmetjs.github.io/)

## Questions or Concerns?

For security issues, please report responsibly. Do not disclose vulnerabilities publicly without giving maintainers time to fix them.
