# Fix: No subscription but subscriptions page shows 3-month plan

## Status: ✅ Plan Approved - In Progress

### 1. Frontend Fix ✅ Complete
- Update `public/js/subscriptions.js`:
  * `hasActiveSubscription()`: Add `daysLeft > 0` check
  * `renderActiveSubscriptionSummary()`: Use daysLeft, stricter status
  * Add refresh button
- **Expected Result:** Page correctly shows/hides based on actual active status

### 2. Diagnostic Script [PENDING]
- Create `scripts/diagnose-user-sub.js`
- Check user's Subscription docs, User.subdoc sync

### 3. Get User Details [PENDING]
- Need: User email/username
- Run: `node scripts/diagnose-user-sub.js --email=...`

### 4. DB Cleanup Script [PENDING]
- Create `scripts/fix-user-expired-sub.js`
- Mark expired subs as 'canceled'

### 5. Backend Improvements [PENDING]
- `src/routes/subscriptions.js`: Stricter `/user/current` query
- `src/models/Subscription.js`: Expired cleanup hook/index

### 6. Prevention [PENDING]
- Cron job for expired sub cleanup

### 7. Testing [PENDING]
- Reload page
- Test subscription flow
- E2E test

**Next:** Implement frontend fix. Approve?
