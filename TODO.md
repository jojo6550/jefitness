# TODO: Remove Hardcoded Subscription Prices

## Tasks
- [x] Update `src/routes/subscriptions.js` to use `getPlanPricing()` from stripe service instead of hardcoded plans
- [x] Update `scripts/assign-user-plan.js` to fetch pricing dynamically from Stripe instead of using hardcoded `PLAN_PRICING`
