# Fix Subscription Checkout 400 Error
Status: [ ] In Progress

## Steps (from approved plan):

- [x] Step 1: Fix src/services/stripe.js - Replace deprecated getPriceIdForPlan() with dynamic getPlanPricing() lookup in createCheckoutSession()
- [x] Step 2: Add logging in src/controllers/subscriptionController.js createCheckout()
- [x] Step 3: Run `node scripts/sync-stripe-to-db.js` to populate StripePlan DB (✅ Synced 4 active plans)
- [ ] Step 4: Test checkout flow end-to-end
- [ ] Step 5: Verify fix & attempt_completion

Current: Starting Step 1...

