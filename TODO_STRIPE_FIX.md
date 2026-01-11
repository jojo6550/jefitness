# Stripe Test Fix Plan

## Issue
ReferenceError: Cannot access 'mockStripe' before initialization

## Root Cause
The `jest.mock()` factory function tries to assign to `let` variables that are in the temporal dead zone due to how Jest hoists `jest.mock()` calls.

## Solution Steps
1. Refactor the mock structure to use a plain object to hold mock references
2. Create mock functions inside the factory and return them
3. Store mock references in a mutable object that tests can access
4. Update test assertions to use the stored mock references

## Files to Edit
- tests/stripe.test.js

## Implementation Details
Replace:
```javascript
let mockCustomersUpdate;
let mockCustomersList;
// ... more let declarations

jest.mock('stripe', () => {
  mockCustomersUpdate = jest.fn();
  // ... assignments
});
```

With:
```javascript
// Mock functions stored in a mutable object
const stripeMocks = {
  customers: {
    update: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [] }),
    // ... etc
  },
  // ... etc
};

jest.mock('stripe', () => {
  return () => stripeMocks;
});
```

Or alternatively, use `jest.requireActual()` pattern or move mock setup to a separate file.

