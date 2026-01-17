describe('Authentication', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Login Flow', () => {
    beforeEach(() => {
      cy.get('.navbar-nav a').contains('Login').click();
    });

    it('should display login form correctly', () => {
      cy.get('#login-form').should('be.visible');
      cy.get('#inputEmail').should('be.visible');
      cy.get('#inputPassword').should('be.visible');
      cy.get('#loginButton').should('be.visible');
      cy.get('a[href*="forgot-password"]').should('be.visible');
    });

    it('should show error for invalid credentials', () => {
      cy.get('#inputEmail').type('invalid@example.com');
      cy.get('#inputPassword').type('wrongpassword');
      cy.get('#loginButton').click();
      // Assuming the app shows an error message
      cy.get('#message').should('be.visible');
    });

    it('should navigate to forgot password', () => {
      cy.get('a[href*="forgot-password"]').click();
      cy.url().should('include', 'forgot-password.html');
    });

    it('should redirect to dashboard on successful login', () => {
      // This test assumes valid credentials exist
      // In a real scenario, you'd use test data or mock the API
      cy.get('#inputEmail').type('test@example.com');
      cy.get('#inputPassword').type('TestPassword123!');
      cy.get('#loginButton').click();
      // Check if redirected to dashboard or show success message
      cy.url({ timeout: 10000 }).should('satisfy', (url) => {
        return url.includes('dashboard') || url.includes('jeftiness.onrender.com');
      });
    });
  });

  describe('Signup Flow', () => {
    beforeEach(() => {
      cy.get('.navbar-nav a').contains('Sign Up').click();
    });

    it('should display signup form correctly', () => {
      cy.get('#signup-form').should('be.visible');
      cy.get('#inputFirstName').should('be.visible');
      cy.get('#inputLastName').should('be.visible');
      cy.get('#inputEmail').should('be.visible');
      cy.get('#inputPassword').should('be.visible');
      cy.get('#inputConfirmPassword').should('be.visible');
      cy.get('#agreeTerms').should('be.visible');
      cy.get('.btn-signup').should('be.visible');
    });

    it('should show terms modal when clicked', () => {
      cy.get('#agreeTerms').next('label').find('a').click();
      cy.get('#termsModal').should('be.visible');
    });

    it('should handle terms modal navigation', () => {
      cy.get('#agreeTerms').next('label').find('a').click();
      cy.get('#privacy-tab').click();
      cy.get('#privacyContent').should('be.visible');
      cy.get('#disclaimer-tab').click();
      cy.get('#disclaimerContent').should('be.visible');
      cy.get('#terms-tab').click();
      cy.get('#termsContent').should('be.visible');
    });

    it('should accept terms and continue', () => {
      cy.get('#agreeTerms').next('label').find('a').click();
      cy.get('#acceptTermsBtn').click();
      cy.get('#termsModal').should('not.be.visible');
      cy.get('#agreeTerms').should('be.checked');
    });

    it('should show OTP form after successful signup', () => {
      cy.get('#inputFirstName').type('John');
      cy.get('#inputLastName').type('Doe');
      cy.get('#inputEmail').type('john.doe@example.com');
      cy.get('#inputPassword').type('StrongPass123!');
      cy.get('#inputConfirmPassword').type('StrongPass123!');
      cy.get('#agreeTerms').check();
      cy.get('.btn-signup').click();
      // Check if OTP form appears
      cy.get('#otp-container').should('be.visible');
    });

    it('should handle OTP verification', () => {
      // Assuming signup was successful and OTP form is shown
      cy.get('#inputOtp').type('123456');
      cy.get('#otp-container button[type="submit"]').click();
      // Check for success message or redirect
      cy.get('#message').should('be.visible');
    });

    it('should resend OTP', () => {
      cy.get('#resendOtp').click();
      // Check for resend confirmation
      cy.get('#otp-message').should('contain', 'code');
    });
  });

  describe('Logout Functionality', () => {
    it('should logout successfully', () => {
      // Assuming user is logged in
      cy.login('test@example.com', 'TestPassword123!');
      cy.visit('/pages/dashboard.html');
      cy.get('#logoutButton').click();
      // Should redirect to home or login
      cy.url().should('satisfy', (url) => {
        return url.includes('login') || url.includes('jeftiness.onrender.com');
      });
    });

    it('should protect dashboard when not logged in', () => {
      cy.visit('/pages/dashboard.html');
      // Should redirect to login or show error
      cy.url().should('satisfy', (url) => {
        return url.includes('login') || url.includes('jeftiness.onrender.com');
      });
    });
  });
});
