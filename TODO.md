<<<<<<< HEAD
# TODO: Fix Mailjet Build Issue on Render

## Steps to Complete:
- [ ] Remove node-mailjet dependency from package.json
- [ ] Update src/routes/auth.js to use fetch for Mailjet API calls instead of node-mailjet Client
- [ ] Test the changes locally if possible
- [ ] Deploy to Render to verify the fix

## Details:
- Replace the Mailjet Client with direct fetch calls to Mailjet's Send API v3.1
- Use MAILJET_API_KEY and MAILJET_SECRET_KEY from environment variables
- Ensure all email sending functions (signup OTP, forgot password, verification confirmation) are updated
=======
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
>>>>>>> parent of 755a865 (`Refactor server-side code to use structured logging with Winston logger service`)
