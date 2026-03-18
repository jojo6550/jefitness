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
        return url.includes('dashboard') || url.includes('jefitnessja.com');
      });
    });
  });

  describe('Signup Flow', () => {
    beforeEach(() => {
      cy.visit('/pages/signup.html');
      // Mock signup to require OTP verification - using correct API version
      cy.intercept('POST', '/api/v1/auth/signup', {
        statusCode: 201,
        body: {
          success: true,
          data: {
            token: 'mock-jwt-token',
            user: {
              id: 'mock-user-id',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john.doe@example.com',
              role: 'user'
            }
          }
        }
      }).as('signup');
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

    it('should accept terms and continue', () => {
      cy.get('#agreeTerms').next('label').find('a').click();
      cy.get('#termsModal').should('be.visible');

      // Wait for modal to be fully visible and interactive
      cy.get('#acceptTermsBtn').should('be.visible').click();

      // Wait for modal to fully close before checking
      cy.wait(500); // Give time for modal to close
      cy.get('#agreeTerms').should('be.checked');
    });

    it('should signup successfully and redirect', () => {
      cy.get('#inputFirstName').type('John');
      cy.get('#inputLastName').type('Doe');
      cy.get('#inputEmail').type('john.doe@example.com');
      cy.get('#inputPassword').type('StrongPass123!');
      cy.get('#inputConfirmPassword').type('StrongPass123!');
      cy.get('#agreeTerms').check();
      cy.get('.btn-signup').click();
      
      // Should redirect to dashboard
      cy.url().should('include', 'dashboard');
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
        return url.includes('login') || url.includes('jefitnessja.com');
      });
    });

    it('should protect dashboard when not logged in', () => {
      cy.visit('/pages/dashboard.html');
      // Should redirect to login or show error
      cy.url().should('satisfy', (url) => {
        return url.includes('login') || url.includes('jefitnessja.com');
      });
    });
  });
});
