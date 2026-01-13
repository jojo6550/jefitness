# Fix Failing Subscription Flow Integration Tests

## Issues to Fix
- [ ] Webhook test failing with 400 Bad Request due to body parsing mismatch
- [ ] Cancel subscription test failing because Subscription document not found

## Tasks
- [ ] Modify webhook route to handle JSON bodies in test environment
- [ ] Update cancel subscription test to create Subscription document
- [ ] Run tests to verify fixes work
- [ ] Clean up any temporary changes
