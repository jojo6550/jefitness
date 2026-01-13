# Subscription API Fix Plan

## Information Gathered
- **Root Cause**: Inconsistent use of `user.subscription.isActive` vs `user.hasActiveSubscription()` across endpoints
- **Issue**: Paid users with expired subscriptions appear active because expiry isn't checked
- **hasActiveSubscription() method**: Checks both `subscription.isActive` AND `currentPeriodEnd` date
- **Affected Endpoints**:
  - `/status`: Uses `hasActiveSubscription()` for initial check but `user.subscription.isActive` for response fields
  - `/user/current`: Uses `hasActiveSubscription()` for `hasActiveSubscription` field but `user.subscription.isActive` for `isActive` field

## Plan
1. **Refactor `/status` endpoint** - Use `hasActiveSubscription()` consistently for all boolean flags
2. **Refactor `/user/current` endpoint** - Simplify logic, remove complex fallbacks, standardize response
3. **Standardize Response Logic** - All endpoints should derive flags from `user.hasActiveSubscription()`

## Dependent Files to be edited
- `src/routes/subscriptions.js` (main file with endpoints)

## Followup steps
- Test changes to verify paid users now get correct subscription data
- Verify frontend correctly interprets the standardized response fields
