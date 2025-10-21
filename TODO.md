# TODO: Add Sentry for Error Tracking and Analytics Monitoring

- [x] Install @sentry/node package via npm
- [x] Initialize Sentry in src/server.js at the top, before other middleware, with DSN from environment variables
- [x] Configure Sentry to capture errors and performance data
- [x] Update error handling middleware in src/server.js to use Sentry's error reporting
- [x] Test server startup to ensure Sentry initializes correctly
- [ ] Verify error logging in Sentry dashboard (requires account setup)
- [ ] Optionally, add client-side Sentry for frontend analytics
