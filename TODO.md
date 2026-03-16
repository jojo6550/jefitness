# OTP Code Not Sending - Implementation Plan

## Completed: 0/9

- [x] 1. Add OTP generation/compare methods to src/models/User.js
- [x] 2. Update src/controllers/authController.js: modify signup (generate/send OTP, no JWT), add verifyEmail, resendOtp, update login (check isEmailVerified)
- [x] 3. Update src/routes/auth.js: add POST /verify-email and /resend-otp routes
- [ ] 4. Test Mailjet env vars/setup (user to provide keys)
- [ ] 5. Restart server
- [ ] 6. Manual test: signup → check email → verify OTP → login
- [ ] 7. Test resend OTP
- [ ] 8. Run Cypress e2e tests (cypress/e2e/authentication.cy.js)
- [ ] 9. Update TODO.md with ✓ and attempt_completion

