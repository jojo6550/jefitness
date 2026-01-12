# Stripe Test Fixes - TODO

## Issues Identified:
1. stripe.test.js: `createSubscription` now includes `default_payment_method` but test expects old signature
2. subscriptions.test.js: Route uses `getStripe()` directly, not mocked service functions

## Fix Plan:

### 1. Fix tests/services/stripe.test.js
- [ ] Update "should create subscription with valid plan" test to expect `default_payment_method` in the call

### 2. Fix tests/routes/subscriptions.test.js
- [ ] Add mock for `getStripe()` to return the mockStripe instance
- [ ] Update route tests to work with the route's direct `getStripe()` usage
- [ ] Ensure the mock returns proper customer with `invoice_settings.default_payment_method`

### 3. Run tests to verify fixes
- [ ] Run npm test to confirm all tests pass

