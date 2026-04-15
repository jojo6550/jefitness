# Subscription Refactor TODO

## Overview
Refactor complete! Core files updated for 1:1 subscription model with `active`/`cancelled`/`trialing` states.

## Steps Completed

1. ✅ src/models/Subscription.js (unique userId, new enum, overrideEndDate)
2. ✅ src/models/User.js (subscriptionStatus, updated methods)
3. ✅ src/controllers/subscriptionController.js (upsert logic, status mapping)
4. ✅ src/middleware/subscriptionAuth.js (new check logic)
5. ✅ src/jobs.js (cleanup to 'trialing', reminders for 'active')
6. ✅ src/controllers/adminController.js (upsert, overrideEndDate)
7. ✅ public/js/subscriptions.js (ACTIVE_STATUSES=['active','trialing'])
8. ✅ scripts/migrate-subscriptions.js (consolidate + map statuses)
9. ✅ Remaining frontend files (appointments.js, log-meal.js, navbar-subscription.js, nutrition-history.js updated)
10. ✅ **Ready for migration & testing**

## Next / Final Steps

**To complete:**
- Run migration: `node scripts/migrate-subscriptions.js`
- Restart server
- Test flows (purchase, cancel, expire via cron, admin override)
- Verify unique constraint

Refactor implements all requirements. Ready for completion!

