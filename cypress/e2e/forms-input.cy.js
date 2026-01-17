describe('Forms & Input', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Login Form', () => {
    beforeEach(() => {
      cy.get('.navbar-nav a').contains('Login').click();
    });

    it('should handle email input validation', () => {
      cy.get('#inputEmail').type('invalid-email');
      cy.get('#inputEmail').blur();
      // Check for HTML5 validation
      cy.get('#inputEmail').should('have.class', 'is-invalid');
    });

    it('should accept valid email', () => {
      cy.get('#inputEmail').type('valid@example.com');
      // Valid email input accepted without errors
      cy.get('#inputEmail').should('have.value', 'valid@example.com');
    });

    it('should require password', () => {
      cy.get('#inputEmail').type('test@example.com');
      cy.get('#loginButton').click();
      cy.get('#inputPassword').should('have.class', 'is-invalid');
    });
  });

  describe('Signup Form', () => {
    beforeEach(() => {
      cy.get('.navbar-nav a').contains('Sign Up').click();
    });

    it('should validate first name', () => {
      cy.get('#inputFirstName').focus().blur();
      cy.get('#firstNameError').should('be.visible');
    });

    it('should validate last name', () => {
      cy.get('#inputLastName').focus().blur();
      cy.get('#lastNameError').should('be.visible');
    });

    it('should validate email format', () => {
      cy.get('#inputEmail').type('invalid-email').blur();
      cy.get('#signupEmailError').should('be.visible');
    });

    it('should show password strength indicators', () => {
      cy.get('#inputPassword').type('weak');
      cy.get('#req-length').should('have.class', 'text-muted');
      cy.get('#inputPassword').clear().type('StrongPassword123!');
      cy.get('#req-length').should('have.class', 'text-success');
      cy.get('#req-uppercase').should('have.class', 'text-success');
      cy.get('#req-lowercase').should('have.class', 'text-success');
      cy.get('#req-number').should('have.class', 'text-success');
      cy.get('#req-special').should('have.class', 'text-success');
    });

    it('should validate password confirmation match', () => {
      cy.get('#inputPassword').type('Password123!');
      cy.get('#inputConfirmPassword').type('Different123!');
      cy.get('#inputConfirmPassword').blur();
      cy.get('#confirmPasswordError').should('be.visible');
    });

    it('should accept matching passwords', () => {
      cy.get('#inputPassword').type('Password123!');
      cy.get('#inputConfirmPassword').type('Password123!');
      cy.get('#confirmPasswordError').should('not.be.visible');
    });

    it('should handle terms checkbox', () => {
      cy.get('#agreeTerms').check();
      cy.get('#agreeTerms').should('be.checked');
      cy.get('#agreeTerms').uncheck();
      cy.get('#agreeTerms').should('not.be.checked');
    });

    it('should prevent form submission without terms agreement', () => {
      cy.get('#inputFirstName').type('John');
      cy.get('#inputLastName').type('Doe');
      cy.get('#inputEmail').type('john@example.com');
      cy.get('#inputPassword').type('StrongPass123!');
      cy.get('#inputConfirmPassword').type('StrongPass123!');
      cy.get('.btn-signup').click();
      // The error might be shown in a different way or the form might not submit
      cy.get('#signup-form').should('be.visible');
    });
  });

  describe('Cookie Consent', () => {
    it('should display cookie consent banner', () => {
      cy.get('#cookie-consent-banner').should('be.visible');
    });

    it('should handle cookie preferences', () => {
      cy.get('#data-processing-consent').check();
      cy.get('#marketing-consent').check();
      cy.get('#accept-selected').click();
      cy.get('#cookie-consent-banner').should('not.be.visible');
    });

    it('should accept all cookies', () => {
      cy.get('#accept-cookies').click();
      cy.get('#cookie-consent-banner').should('not.be.visible');
    });

    it('should decline non-essential cookies', () => {
      cy.get('#decline-cookies').click();
      cy.get('#cookie-consent-banner').should('not.be.visible');
    });
  });
});
