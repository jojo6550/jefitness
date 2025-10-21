# Security Enhancements TODO

## Dependencies
- [ ] Install express-rate-limit for API rate limiting
- [ ] Install helmet for security headers
- [ ] Install express-validator for input sanitization and validation

## User Model Updates
- [ ] Add failedLoginAttempts field to User schema
- [ ] Add lockoutUntil field to User schema

## Server.js Updates
- [ ] Add helmet middleware for security headers

## Auth Routes Updates
- [ ] Add rate limiting middleware to auth routes
- [ ] Add input validation and sanitization to signup route
- [ ] Add password strength validation to signup route
- [ ] Implement account lockout logic in login route
- [ ] Add input validation to login route
- [ ] Add input validation to other auth routes (forgot-password, reset-password, verify-email)

## Testing
- [ ] Test rate limiting functionality
- [ ] Test security headers with helmet
- [ ] Test input sanitization
- [ ] Test password strength requirements
- [ ] Test account lockout after failed attempts
