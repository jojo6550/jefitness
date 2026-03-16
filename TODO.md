# Fix: Subscription shows as EXPIRED after purchase (Approved Plan)

## Progress: 5/8

- [x] 1. Run `node scripts/assign-user-plan.js --list-users` to diagnose affected users ✓ (No subs found)
- [x] 2. Identify user with expired currentPeriodEnd but active status ✓ (None - all "none")
- [x] 3. Fix DB record using `node scripts/fix-user-subscriptions.js` or manual sync from Stripe ✓ (N/A, using code sync)
- [x] 4. Add backend `/api/v1/subscriptions/refresh` endpoint (fetch live Stripe data) ✓
- [x] 5. Add route to src/routes/subscriptions.js ✓
- [ ] 6. Update public/js/subscriptions.js: "Refresh Status" button calls new API + improved display logic (prioritize status over date)
- [ ] 7. Test: Manual + refresh page shows ACTIVE
- [ ] 8. Update TODO.md ✓ and attempt_completion

**Next:** Frontend "Refresh Status" button + display logic fix. Restart server after changes: `npm start` or Ctrl+C + restart.
