# CSP/Login Backend Health Check Fix (Option 3 - Force Production API_BASE)

## Status: In Progress

### Steps:
- [x] Step 1: Create TODO.md ✅
- [ ] Step 2: Edit `public/js/api.config.js` - Force `API_BASE='https://jefitnessja.com'` for PRODUCTION environments
- [ ] Step 3: Test health check uses correct `https://jefitnessja.com/api/health`
- [ ] Step 4: Verify login flow (no CSP violation)
- [ ] Step 5: Deploy/test production
- [ ] Step 6: Complete task

**Why this fixes it:**
Current issue: Frontend on Render.com → `window.location.origin` = `https://jefitness.onrender.com`
`checkBackendHealth()` → `https://jefitness.onrender.com/api/health` → CSP BLOCKED

Fix: Force PRODUCTION → `API_BASE='https://jefitnessja.com'` → `https://jefitnessja.com/api/health` → CSP ✅ ALREADY ALLOWED

**Expected result:** Health check passes, login succeeds.

