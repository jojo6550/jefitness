describe('Basic Site Availability', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should load the home page successfully', () => {
    cy.url().should('include', 'jefitness.onrender.com');
    cy.get('title').should('contain', 'JE Fitness');
  });

  it('should display key UI elements on home page', () => {
    cy.get('h1').should('contain', 'FITNESS FOR THE ELITE');
    cy.get('.btn-primary').should('contain', 'Get Started Today');
    cy.get('.navbar-brand').should('contain', 'JE FITNESS');
    cy.get('footer').should('be.visible');
  });

  it('should have proper page title', () => {
    cy.title().should('eq', 'JE Fitness | Fitness FOR THE ELITE');
  });

  it('should display services section', () => {
    cy.get('#services').should('be.visible');
    cy.get('#services h2').should('contain', 'Premium Services');
    cy.get('.service-card').should('have.length', 3);
  });

  it('should display products showcase', () => {
    cy.get('#products-showcase').should('be.visible');
    cy.get('#products-showcase h2').should('contain', 'True Biotics');
    cy.get('.product-card').should('have.length', 3);
  });
});
