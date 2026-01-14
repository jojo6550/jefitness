# TODO: Fix Incorrect Subscription End Dates

## Task: Replace approximate day calculations with proper calendar-based date arithmetic for subscription end dates.

---

## Root Cause:
The issue is caused by using approximate day calculations (30 days for months, 365 days for years) instead of proper calendar-based date arithmetic. This leads to incorrect end dates for subscriptions.

## Changes to Make:

### 1. Create Date Utility Function - `src/utils/dateUtils.js`
- [ ] Create utility function `calculateSubscriptionEndDate(plan, startDate)` that properly calculates end dates based on calendar intervals
- [ ] Handle months properly (accounting for different month lengths)
- [ ] Handle years properly (accounting for leap years)

### 2. Update `src/routes/subscriptions.js`
- [ ] Replace `calculatePeriodEnd` function to use the new utility
- [ ] Fix fallback logic in POST /create to use plan-specific defaults instead of always 30 days

### 3. Update `scripts/fix-subscription-period-end.js`
- [ ] Replace fixed day calculations with proper date arithmetic
- [ ] Update `calculateCorrectPeriodEnd` to use the new utility function

---

## Summary of Changes:

1. **New Utility Function**:
   - Proper month calculation (add months to date, not fixed days)
   - Proper year calculation (add years to date, accounting for leap years)

2. **Updated Route Logic**:
   - Use accurate calculations in `calculatePeriodEnd`
   - Plan-specific fallback defaults

3. **Updated Fix Script**:
   - Use proper date arithmetic instead of fixed day counts

---

## Status:
- [ ] Plan approved
- [ ] Implementation started
- [ ] Implementation completed
- [ ] Testing completed
