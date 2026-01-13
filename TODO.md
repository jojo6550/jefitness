# Subscription Refactor TODO

## Backend Routes
- [ ] Update src/routes/subscriptions.js: Replace old field checks with user.subscription.isActive, use user.subscription.plan, etc.
- [ ] Update src/routes/webhooks.js: Populate/clear subscription object instead of old fields
- [ ] Update src/routes/auth.js: Return subscription info using new structure

## Middleware
- [ ] Update src/middleware/subscriptionAuth.js: Remove old field references in error details

## Services
- [ ] Update src/services/subscriptionExpiry.js: Use subscription object for expiry checks

## Scripts
- [ ] Update scripts/fix-user-subscriptions.js: Use new subscription object
- [ ] Update scripts/manage-user-subscription.js: Use new subscription object
- [ ] Update scripts/change-user-plan.js: Use new subscription object
- [ ] Update scripts/migrate-users.js: Use new subscription object

## Tests
- [ ] Update tests/services/subscriptionExpiry.test.js: Update test data and assertions

## Frontend
- [ ] Update public/js/subscriptions.js: Use user.subscription.isActive and new fields
- [ ] Update public/pages/dashboard.html: Update UI gating logic

## Cleanup
- [ ] Remove all logic referencing deprecated fields
- [ ] Ensure expiration checks use subscription.currentPeriodEnd
