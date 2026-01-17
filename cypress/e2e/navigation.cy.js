describe('Navigation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should navigate to login page from header', () => {
    cy.get('.navbar-nav a').contains('Login').click();
    cy.url().should('include', '/pages/login.html');
    cy.get('h2').should('contain', 'Login to Your Account');
  });

  it('should navigate to signup page from header', () => {
    cy.get('.navbar-nav a').contains('Sign Up').click();
    cy.url().should('include', '/pages/signup.html');
    cy.get('h2').should('contain', 'Create Your Account');
  });

  it('should navigate to products page from header', () => {
    cy.get('.navbar-nav a').contains('Products').click();
    cy.url().should('include', '/pages/products.html');
  });

  it('should navigate to home page from navbar brand', () => {
    cy.get('.navbar-brand').click();
    cy.url().should('include', 'jeftiness.onrender.com');
  });

  it('should navigate to products from service cards', () => {
    cy.get('.product-card a').first().click();
    cy.url().should('include', '/pages/products.html');
  });

  it('should have working footer social links', () => {
    cy.get('footer a').should('have.attr', 'href').and('not.be.empty');
  });

  it('should navigate back to home from login page', () => {
    cy.get('.navbar-nav a').contains('Login').click();
    cy.get('.navbar-nav a').contains('Home').click();
    cy.url().should('include', 'jeftiness.onrender.com');
  });

  it('should navigate back to home from signup page', () => {
    cy.get('.navbar-nav a').contains('Sign Up').click();
    cy.get('.navbar-nav a').contains('Home').click();
    cy.url().should('include', 'jeftiness.onrender.com');
  });
});
