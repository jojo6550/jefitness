# TODO: View-Subscription Page Implementation

## Tasks
- [x] 1. Create public/pages/view-subscription.html
- [x] 2. Create public/js/view-subscription.js
- [x] 3. Update src/routes/subscriptions.js - add invoice endpoint, improved subscription query with daysLeft calculation
- [x] 4. Update public/js/router.js - add route for /view-subscription
- [x] 5. Update public/js/subscriptions.js - redirect when user has subscription, fixed status check

## Summary
All tasks completed. Users with an active subscription are now automatically redirected from the subscriptions page to the view-subscription page where they can see:
- Subscription type (1-month, 3-month, 6-month, 12-month)
- Subscription status (Active, Canceled, Expired)
- Days remaining with progress bar
- Next billing date
- Billing history with invoice downloads
- Cancel subscription option

## Changes Made
1. **Backend**: Updated `/api/v1/subscriptions/user/current` to include `past_due` and `paused` statuses, and calculate `daysLeft`
2. **Frontend**: Fixed token handling to get fresh token on each request
3. **Frontend**: Fixed `hasActiveSubscription` to check `status` field instead of non-existent `isActive` property

