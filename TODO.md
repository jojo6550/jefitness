# TODO: Fix Subscription Pricing to be Dynamically Loaded

## Problem
The subscription pricing text like `'$29.99 billed monthly'` is hardcoded in `public/js/subscriptions.js` instead of being dynamically loaded from the API.

## Plan
1. Modify `renderPlans()` function in `public/js/subscriptions.js`:
   - Remove the hardcoded `planBenefits` object
   - Dynamically generate billing text using `plan.amount` from API data
   - Create benefits based on plan tier (more benefits for longer plans)

## Steps
- [x] 1. Create TODO.md file to track progress
- [x] 2. Modify `renderPlans()` in `public/js/subscriptions.js` to dynamically generate billing text
- [ ] 3. Test the changes by verifying the subscription page loads dynamic pricing

## Status
- [ ] In Progress
- [x] Completed

