# TODO: Implement Morgan Logging and Replace Current Logger System

## Information Gathered
- Current logger uses Winston with multiple specialized loggers (general, admin, user, security)
- Logger is used in server.js for server events and errors, and in routes for various logging needs
- Morgan is installed and will be used for HTTP request logging
- The replacement will use Morgan for HTTP logs and console.log for other logs to fully replace Winston

## Plan
- [x] Update server.js to use Morgan middleware for HTTP request logging
- [x] Replace Winston logger imports and usage with console.log equivalents
- [x] Update routes/auth.js to use console.log instead of Winston functions
- [x] Update routes/appointments.js to use console.log instead of Winston functions
- [x] Update routes/notifications.js to use console.log instead of Winston functions
- [x] Update routes/logs.js to work with real-time logging system (no sample logs)
- [x] Update routes/cart.js and routes/orders.js with console.log
- [x] Remove Winston dependency from package.json
- [x] Delete src/services/logger.js file

## Dependent Files to be Edited
- src/server.js: Add Morgan middleware, replace logger usage
- src/routes/auth.js: Replace logger functions with console.log
- src/routes/appointments.js: Replace logger functions with console.log
- src/routes/notifications.js: Replace logger functions with console.log
- src/routes/logs.js: Updated to work with sample data instead of Winston
- src/routes/cart.js: Added console.log for cart operations
- src/routes/orders.js: Added console.log for order operations
- package.json: Remove winston dependency

## Followup Steps
- [x] Test the application to ensure logging works correctly
- [x] Verify HTTP requests are logged by Morgan
- [x] Check that other logs appear in console
