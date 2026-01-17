describe('Responsiveness', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1280, height: 720 },
    { name: 'Large Desktop', width: 1920, height: 1080 }
  ];

  viewports.forEach((viewport) => {
    describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      beforeEach(() => {
        cy.viewport(viewport.width, viewport.height);
      });

      it('should display home page correctly', () => {
        cy.get('body').should('be.visible');
        cy.get('h1').should('be.visible');
        cy.get('.navbar').should('be.visible');
        cy.get('footer').should('be.visible');
      });

      it('should handle navigation menu', () => {
        if (viewport.width < 768) {
          // Mobile menu
          cy.get('.navbar-toggler').should('be.visible');
          cy.get('.navbar-toggler').click();
          cy.get('.navbar-collapse').should('have.class', 'show');
        } else {
          // Desktop menu
          cy.get('.navbar-nav').should('be.visible');
        }
      });

      it('should display hero section properly', () => {
        cy.get('.hero').should('be.visible');
        cy.get('.hero h1').should('be.visible');
        cy.get('.btn-primary').should('be.visible');
      });

      it('should display services section', () => {
        cy.get('#services').should('be.visible');
        cy.get('.service-card').should('have.length', 3);
      });

      it('should display products section', () => {
        cy.get('#products-showcase').should('be.visible');
        cy.get('.product-card').should('have.length', 3);
      });

      it('should handle login form', () => {
        cy.get('.navbar-nav a').contains('Login').click();
        cy.get('#login-form').should('be.visible');
        cy.get('#inputEmail').should('be.visible');
        cy.get('#inputPassword').should('be.visible');
        cy.get('#loginButton').should('be.visible');
      });

      it('should handle signup form', () => {
        cy.get('.navbar-nav a').contains('Sign Up').click();
        cy.get('#signup-form').should('be.visible');
        cy.get('#inputFirstName').should('be.visible');
        cy.get('#inputLastName').should('be.visible');
        cy.get('#inputEmail').should('be.visible');
        cy.get('#inputPassword').should('be.visible');
        cy.get('#inputConfirmPassword').should('be.visible');
      });

      it('should display cookie consent banner', () => {
        cy.get('#cookie-consent-banner').should('be.visible');
      });

      it('should handle dashboard layout', () => {
        cy.visit('/pages/dashboard.html');
        cy.get('.dashboard-nav-card').should('be.visible');
        cy.get('.welcome-section').should('be.visible');
      });
    });
  });

  describe('Orientation Changes', () => {
    it('should handle orientation change on mobile', () => {
      cy.viewport('iphone-6', 'portrait');
      cy.get('body').should('be.visible');
      cy.viewport('iphone-6', 'landscape');
      cy.get('body').should('be.visible');
    });
  });

  describe('Touch Interactions', () => {
    it('should handle touch events on mobile', () => {
      cy.viewport('iphone-6');
      cy.get('.navbar-toggler').should('be.visible');
      // Touch interactions would be tested with cy.touch() if available
    });
  });
});
