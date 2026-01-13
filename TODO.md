# Stripe Subscription System Debug Plan

## Immediate Fixes Needed

### 1. Fix Stripe Mocking
- [ ] Complete the Stripe mock in `tests/mocks/stripe.js` to include all methods used by the service
- [ ] Add missing methods: `prices.list`, `customers.list`, `products.list`, `paymentMethods.list`, `paymentMethods.detach`, `paymentIntents.create`, `invoices.list`, `checkout.sessions.retrieve`, `products.retrieve`

### 2. Fix Security Logging Type Mismatch
- [ ] Change 'unknown' to null in `src/middleware/errorHandler.js`
- [ ] Change 'unknown' to null in `src/middleware/requestLogger.js`

### 3. Fix Subscription Cancellation Test
- [ ] Ensure `user.stripeSubscriptionId` is set correctly in test setup in `tests/backend/integration/subscription-flow.test.js`

### 4. Fix /me Endpoint Tests
- [ ] Verify auth middleware mocking in unit tests

### Code Changes
- [ ] Modify `errorHandler.js` and `requestLogger.js` to use null instead of 'unknown'
- [ ] Enhance Stripe mock in `tests/mocks/stripe.js`
- [ ] Review and fix test setup in `subscription-flow.test.js`

### Verification
- [ ] Run tests to confirm all failures are resolved
- [ ] Ensure no regressions in existing functionality
- [ ] Validate that security logging works correctly with proper types
