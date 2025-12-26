# Fix ECONNRESET Error in Unverified Accounts Cleanup Job

## Completed Tasks
- [x] Analyzed the error: MongoNetworkError: read ECONNRESET during cron job execution
- [x] Improved MongoDB connection options for better resilience:
  - Reduced serverSelectionTimeoutMS to 5s
  - Set socketTimeoutMS to 45s
  - Limited maxPoolSize to 10
  - Forced IPv4 usage
- [x] Added retry logic with exponential backoff to cleanup job (3 retries with 2s, 4s, 6s delays)
- [x] Enhanced error logging to include retry attempts

## Summary of Changes
- Modified `src/server.js` to include robust MongoDB connection settings
- Implemented retry mechanism for the cleanup cron job to handle transient network errors
- Improved error reporting for better debugging

The ECONNRESET error should now be mitigated through better connection handling and automatic retries.
