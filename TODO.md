# Fixes TODO: Refactoring JE Fitness Application

## Issue 1: Monolithic server.js

### Tasks:
- [x] 1.1 Create `src/app.js` - Extract Express app creation
- [x] 1.2 Create `src/config/database.js` - Extract MongoDB connection
- [x] 1.3 Create `src/config/cron.js` - Extract cron jobs
- [x] 1.4 Create `src/routes/index.js` - Central route registration
- [x] 1.5 Simplify `src/server.js` - Keep only server startup logic

## Issue 2: Inconsistent Middleware Application

### Tasks:
- [x] 2.1 Fix syntax errors in server.js route registrations (missing `=> next()`)
- [x] 2.2 Create `src/middleware/protectedRoute.js` - Standard middleware wrapper for protected routes
- [x] 2.3 Remove redundant `auth` middleware from route files (clients.js, users.js, etc.)
- [x] 2.4 Apply consistent consent middleware across all protected routes
- [x] 2.5 Clean up test bypass pattern

## Issue 3: Mixed Traditional HTML with SPA Approach

### Tasks:
- [ ] 3.1 Document the architectural decision (MPA vs SPA)
- [ ] 3.2 Option A: Convert to full SPA with React/Next.js (recommend)
- [ ] 3.2 Option B: Standardize on traditional MPA (keep HTML pages, remove SPA fallback)
- [ ] 3.3 Update server.js to serve appropriate content based on decision
- [ ] 3.4 Update client-side JavaScript to match chosen architecture

## Priority Order:
1. ✅ Fix critical syntax errors in server.js (Issue 2.1)
2. ✅ Create middleware wrapper (Issue 2.2)
3. ✅ Remove redundant middleware from routes (Issue 2.3-2.4)
4. ✅ Refactor server.js into modules (Issue 1)
5. ⚠️ Make architectural decision for SPA/MPA (Issue 3)

## Summary of Changes Made:

### Fixed Route Files:
- ✅ src/routes/clients.js - Removed redundant auth middleware
- ✅ src/routes/users.js - Removed redundant auth middleware (kept requireAdmin for admin routes)
- ✅ src/routes/logs.js - Removed redundant auth middleware
- ✅ src/routes/appointments.js - Removed redundant auth middleware (kept requireActiveSubscription)
- ✅ src/routes/workouts.js - Removed redundant auth and consent middleware
- ✅ src/routes/medical-documents.js - Removed redundant auth middleware
- ✅ src/routes/trainer.js - Removed redundant auth middleware (kept requireTrainer and requireActiveSubscription)
- ✅ src/routes/gdpr.js - Removed redundant auth middleware

### Created New Files:
- ✅ src/middleware/protectedRoute.js - Middleware wrapper for consistent route protection

### Fixed server.js:
- ✅ Fixed syntax errors in route registrations
- ✅ Removed messy test bypass pattern
