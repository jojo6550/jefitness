# JE Fitness Production Crash Fix - /api/v1/auth/login SIGTERM
## Status: 🔄 In Progress

### ✅ Step 1: Create this TODO.md [DONE]

### ✅ Step 2: Fix src/controllers/authController.js
- [x] Add JWT_SECRET null checks before jwt.sign() in login & signup
- [x] Throw safe ExternalServiceError

### ✅ Step 3: Fix src/server.js
- [x] Add process.on('uncaughtException', ...)
- [x] Add process.on('unhandledRejection', ...)
- [x] Add startup JWT_SECRET validation

### ⬜ Step 4: Test locally (simulate missing JWT_SECRET)
- [ ] Unset JWT_SECRET
- [ ] npm start
- [ ] POST /api/v1/auth/login -> expect safe 500, no crash

### ⬜ Step 5: Deploy Instructions
- [ ] Set JWT_SECRET in Render dashboard
- [ ] Deploy updated code
- [ ] Test production endpoint

**Root Cause**: Missing JWT_SECRET in Render env vars → jwt.sign(undefined) → sync crash → no uncaught handler → process.exit() → Render SIGTERM

**Expected Result**: Safe 500 error if missing env, detailed logs, no crashes.

