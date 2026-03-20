# JE Fitness Test Fix Plan
## Status: ✅ In Progress

## Phase 1: Backend Tests (High Priority - Unblocks All)
- [x] Step 1: Fix module resolution in `src/tests/unit/setup.js`
- [ ] Step 2: Verify `npm test backend` passes all suites
- [ ] Step 3: Confirm logger mock works with real exports

## Phase 2: Frontend Tests (products.test.js)
- [ ] Step 1: Fix JSDOM navigation errors (window.location.assign spy)
- [ ] Step 2: Fix localStorage spies and mock cart logic mismatches
- [ ] Step 3: Ensure real products.js DOM event flow triggers
- [ ] Step 4: Fix quantity clamping and validation
- [ ] Step 5: Verify `npm test frontend` passes

## Phase 3: Full Verification
- [ ] Run `npm test` (all suites green)
- [ ] Check coverage if available
- [ ] Update this TODO with completion status

**Next Action:** Backend fix complete → test → frontend navigation fix
