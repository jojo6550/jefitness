# JE Fitness Stress Test Fix TODO

## Status: [4/7] Steps completed

✅ **Done**
- [x] 1. Add stressVerify handler to src/controllers/authController.js ✓
- [ ] 2. Add POST /api/v1/auth/stress-bypass-verify route to src/routes/auth.js  
- [x] 3. Add STRESS_BYPASS_VERIFY env parsing + bypass API call in regularUserScenario ✓
- [] 4. Add random stagger delay (50-250ms) before each regular user scenario start ✓
- [ ] 5. Add console logging for BYPASS MODE detection
- [ ] 6. Test bypass endpoint manually (curl localhost:10000/api/v1/auth/stress-bypass-verify)
- [ ] 7. Run full stress test with STRESS_BYPASS_VERIFY=true and verify completion

- [ ] 3. Add STRESS_BYPASS_VERIFY env parsing + bypass API call in regularUserScenario (src/tests/stress/stress-test.js)
- [ ] 4. Add random stagger delay (50-250ms) before each regular user scenario start
- [ ] 5. Add console logging for BYPASS MODE detection
- [ ] 6. Test bypass endpoint manually (curl localhost:10000/api/v1/auth/stress-bypass-verify)
- [ ] 7. Run full stress test with STRESS_BYPASS_VERIFY=true and verify completion

## Next Action
Edit src/routes/auth.js (step 2)

**Run:** `node src/tests/stress/stress-test.js` (without bypass → should fail at login)
**With bypass:** `STRESS_BYPASS_VERIFY=true node src/tests/stress/stress-test.js` (should complete all flows)


