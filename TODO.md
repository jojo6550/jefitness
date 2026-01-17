# TODO: Fix Cypress Test Failures

## Tasks
- [x] Add `openNavIfCollapsed` helper to `cypress/support/commands.js`
- [x] Update `cypress/e2e/authentication.cy.js`:
  - [x] Remove `cy.waitForModalClose('#termsModal')` and replace with `cy.get('#termsModal').should('not.be.visible')`
  - [x] Change OTP success assertion to `cy.url().should('include', 'dashboard')`
  - [x] Add visibility check for resend OTP: `cy.get('#otp-message').should('be.visible').and('contain', 'code')`
- [x] Update `cypress/e2e/error-handling.cy.js`: Add `cy.openNavIfCollapsed()` before navbar link clicks
- [x] Update `cypress/e2e/forms-input.cy.js`: Replace Bootstrap class assertions with error element checks
- [x] Update `cypress/e2e/responsiveness.cy.js`: Add `cy.openNavIfCollapsed()` before nav link clicks and assertions
- [ ] Run Cypress tests to verify fixes
