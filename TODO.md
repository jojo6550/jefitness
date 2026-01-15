# MongoDB Schema Redesign for User Action Logs

## Tasks
- [x] Update src/services/compliance.js: Replace all $push operations with UserActionLog.logAction calls
- [x] Update src/routes/gdpr.js: Change /audit-log endpoint to query UserActionLog collection
- [x] Remove auditLog field from src/models/User.js schema
- [ ] Create scripts/migrate-audit-logs.js: Batch migrate existing auditLog arrays to UserActionLog collection
- [x] Update scripts/migrate-users.js: Handle auditLog removal during user migrations
- [ ] Test migration and updated code
