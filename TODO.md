# Fix Subscription Flow Integration Tests

## Tasks
- [ ] Add Stripe mocking to the webhook test to bypass signature verification
- [ ] Update the cancel subscription route to handle cases where no Subscription document exists
- [ ] Run tests to verify fixes

## Details
- The webhook test fails because Stripe signature verification fails with mock signature
- The cancel subscription test fails because the route expects a Subscription document but only user data exists
