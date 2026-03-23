# Refactor Subscription Price Fetch - DB Source of Truth

## Steps:
- [ ] 1. Sync DB: Run \`node scripts/sync-stripe-to-db.js\`
- [x] 1. Sync DB: Run \`node scripts/sync-stripe-to-db.js\`
- [x] 2. Update src/services/stripe.js: Implement getStripePlans(), getPriceIdForPlan(), getPlanPricing() → DB
- [x] 3. Refactor callers: createSubscription/createCheckout/updateSubscription → getPriceIdForPlan(plan)
- [x] 4. Update src/controllers/subscriptionController.js: getPlanNameFromPriceId in verify/refresh
- [x] 5. src/config/subscriptionConstants.js: Deprecated PLAN_MAP
- [x] 6. Added unit tests: src/tests/services/stripe.test.js, src/tests/controllers/subscriptionController.test.js
- [ ] 7. Frontend verification (manual)

**COMPLETED ✅ Run `npm test` to verify!**

