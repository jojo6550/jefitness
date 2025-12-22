# TODO: Implement Morgan Logging and Replace Current Logger System

## Information Gathered
- Current logger uses Winston with multiple specialized loggers (general, admin, user, security)
- Logger is used in server.js for server events and errors, and in routes for various logging needs
- Morgan is installed and will be used for HTTP request logging
- The replacement will use Morgan for HTTP logs and console.log for other logs to fully replace Winston

## Plan
- [ ] Update server.js to use Morgan middleware for HTTP request logging
- [ ] Replace Winston logger imports and usage with console.log equivalents
- [ ] Update routes/auth.js to use console.log instead of Winston functions
- [ ] Update routes/appointments.js to use console.log instead of Winston functions
- [ ] Update routes/notifications.js to use console.log instead of Winston functions
- [ ] Remove Winston dependency from package.json
- [ ] Delete src/services/logger.js file

## Dependent Files to be Edited
- src/server.js: Add Morgan middleware, replace logger usage
- src/routes/auth.js: Replace logger functions with console.log
- src/routes/appointments.js: Replace logger functions with console.log
- src/routes/notifications.js: Replace logger functions with console.log
- package.json: Remove winston dependency

## Followup Steps
- [ ] Test the application to ensure logging works correctly
- [ ] Verify HTTP requests are logged by Morgan
- [ ] Check that other logs appear in console
