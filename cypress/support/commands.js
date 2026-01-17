// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

Cypress.Commands.add('login', (email, password) => {
  cy.visit('/pages/login.html');
  cy.get('#inputEmail').type(email);
  cy.get('#inputPassword').type(password);
  cy.get('#loginButton').click();
});

Cypress.Commands.add('signup', (userData) => {
  cy.visit('/pages/signup.html');
  cy.get('#inputFirstName').type(userData.firstName);
  cy.get('#inputLastName').type(userData.lastName);
  cy.get('#inputEmail').type(userData.email);
  cy.get('#inputPassword').type(userData.password);
  cy.get('#inputConfirmPassword').type(userData.password);
  cy.get('#agreeTerms').check();
  cy.get('.btn-signup').click();
});

Cypress.Commands.add('logout', () => {
  cy.get('#logoutButton').click();
});

Cypress.Commands.add('openNavIfCollapsed', () => {
  cy.get('body').then($body => {
    if ($body.find('.navbar-toggler').is(':visible') && $body.find('.navbar-collapse').not('.show').length > 0) {
      cy.get('.navbar-toggler').click();
      cy.get('.navbar-collapse').should('have.class', 'show');
    }
  });
});
