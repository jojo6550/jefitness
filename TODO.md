# API Base URL Fix - jefitness.onrender.com → jefitnessja.com

## Steps
- [ ] Step 1: Update public/js/api.config.js - Add Render.com detection to force https://jefitnessja.com backend
- [ ] Step 2: Update src/config/security.js - Remove old "https://jefitness.onrender.com" from CSP connectSrc
- [ ] Step 3: Test configuration in browser console
- [ ] Step 4: Verify no other onrender.com references (search_files check)
- [ ] Step 5: Complete task

**Current: Step 3 - Testing**
