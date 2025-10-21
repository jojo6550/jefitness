# Structured Logging Implementation TODO

## Overview
Replace all console.log/error/warn statements in server-side code with structured logging using the Winston logger service.

## Files to Update
- [ ] config/db.js - Replace console.log/error with logger
- [ ] src/routes/users.js - Replace console.error with logger.error
- [ ] src/routes/clients.js - Replace console.error with logger.error
- [ ] src/routes/nutrition.js - Replace console.error with logger.error
- [ ] src/routes/sleep.js - Replace console.error with logger.error
- [ ] src/routes/appointments.js - Replace console.error with logger.error
- [ ] src/middleware/auth.js - Replace console.error with logger.error
- [ ] src/scripts/migrate-users.js - Replace console.log/error with logger
- [ ] src/routes/auth.js - Check and replace any remaining console statements
- [ ] src/routes/logs.js - Already uses structured logging (verify)
- [ ] src/server.js - Already uses structured logging (verify)

## Testing
- [ ] Test application startup and verify logs are written to files
- [ ] Test error scenarios and verify error logging
- [ ] Verify console output shows colored logs
- [ ] Check log files in src/logs/ directory

## Completion
- [ ] Update this TODO.md to mark task as complete
