# TODO: Remove Mailjet/Emailing/OTP Code Cleanup

## Status: Not Started

### 1. Create TODO.md [COMPLETED]
- [x] Generate this file with task list

### 2. Edit Configuration Files
- [x] src/config/security.js: Remove Mailjet CSP entry ✅
- [x] src/middleware/csrf.js: Remove OTP routes ✅

### 3. Remove Frontend OTP Code
- [x] public/pages/signup.html: Delete #otp-container ✅
- [x] public/js/auth.js: Remove OTP handlers ✅
- [x] public/js/validators.js: Delete validateOTP ✅

### 4. Update Tests
- [x] cypress/e2e/authentication.cy.js: Remove OTP tests ✅

### 5. Cleanup Documentation
- [ ] Delete TODO-OTP-EMAIL.md

### 6. Verification
- [x] search_files for "otp|verify-email|resend-otp|mailjet" → Verify 0 results
- [ ] Test signup/login flows
- [ ] Restart server
- [ ] attempt_completion

**Next**: Execute parallel edit_file operations.
