# Jest Tests Fix Progress

## Plan Status
✅ **Approved by user**

## TODO Steps (Backend First)

### Step 1: Fix Backend Setup ✅ COMPLETE
- ✅ Edit `src/tests/unit/setup.js`: Remove duplicate `jest` declaration
- [ ] Test: `npm test` (expect backend tests to pass)

### Step 2: Fix Frontend LocalStorage Mocking ✅ COMPLETE
- ✅ Edit `public/tests/setup-jsdom.js`: Convert localStorage methods to proper Jest spies with mock storage
- [ ] Test: Verify localStorage mocking works

### Step 3: Fix Frontend Products Test File
- [ ] Edit `public/tests/unit/products.test.js`: 
  - Create mock `window.productsCart`
  - Fix localStorage spy usage
  - Remove JSDOM-incompatible window.location assignment
  - Fix quantity validation test
  - Mock product data for addToCart tests
- [ ] Test: `npm test` (expect frontend tests to pass)

### Step 4: Full Verification
- [ ] Run `npm test` - All tests passing
- [ ] Run `npm run test:coverage` for coverage report
- [ ] ✅ **attempt_completion**

## Current Status
- Backend blocker identified: setup.js duplicate jest
- Frontend issues mapped: mocking + test logic
