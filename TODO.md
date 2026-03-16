# Structured Logging Implementation TODO

## Approved Plan Summary
- Central Winston logger with rotation in `src/services/logger.js`
- Replace all console.* across backend/frontend/scripts
- Structured JSON logs with full context
- Winston deps + daily rotation
- Backend/DB integration for audits

Status: [4/14] ✅✅✅✅⭕⭕⭕⭕⭕⭕⭕⭕⭕⭕

## Breakdown Steps

### Phase 1: Core Infrastructure [4/4] ✅✅✅✅
- [ ] 1. Install deps: `npm i winston-daily-rotate-file`
- [ ] 2. Create central logger.js with Winston + rotation
- [    ] 3. Init logger in server.js (early)
- [ ] 4. Create logs/ dir + test rotation

### Phase 2: Backend Core [4/4] ✅✅✅✅
- [ ] 5. Update middleware: requestLogger.js, errorHandler.js
- [ ] 6. Fix server.js console.logs
- [ ] 7. Controllers: authController.js, subscriptionController.js
- [ ] 8. Models: User.js, Subscription.js hooks

### Phase 3: Full Backend Propagation [0/3]
- [ ] 9. Services: monitoring.js, compliance.js (already partial)
- [ ] 10. All other controllers/routes using console
- [ ] 11. Scripts: seedPrograms.js sample + CLI logger

### Phase 4: Frontend & Testing [0/3]
- [ ] 12. public/js/ structured console logger (app.js)
- [ ] 13. Add /api/v1/logs/stats endpoint
- [ ] 14. Test: files/DB/console, rotation, high load

**Next:** Phase 1 Step 1 → Install deps

**Instructions:** Update this file as steps complete (e.g., [x]).

