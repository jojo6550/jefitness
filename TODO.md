# Fix Stripe Checkout Session "No such customer" Error
Status: 🔄 In Progress | Priority: 🚨 Critical

## Breakdowned Steps from Approved Plan

### ✅ 1. Create TODO.md [COMPLETED]

### ✅ 2. Implement Defensive Customer Validation
- ✅ Edit `src/services/stripe.js`: Added `stripe.customers.retrieve(customerId)` validation + logging in `createCheckoutSession`
- ✅ Handle `resource_missing` with user-friendly error: "Customer account invalid"

### ✅ 3. Enhance subscriptionController.createCheckout
- ✅ Force `createOrRetrieveCustomer` call **ALWAYS** (ignore stale DB `stripeCustomerId`)
- ✅ Comprehensive logging: userId, email, customerId at each step
- ✅ Update user DB with verified customer ID
- ✅ Clear stale customerId on validation failure
- ✅ User-friendly JSON errors + session response with `customerId`, `planId`

### ⏳ 4. Test Implementation
- [ ] Run unit tests: `npm test src/tests/services/stripe.test.js`
- [ ] Manual test: POST `/api/v1/subscriptions/checkout` with `planId: "6-month"`
- [ ] Test affected user: `node scripts/detail-user-full.js 69bc45489755c9aa93aaa267`
- [ ] Force `createOrRetrieveCustomer` call (ignore stale DB)
- [ ] Validate returned customer exists before checkout
- [ ] Save verified customerId to user
- [ ] User-friendly error messages

### ⏳ 4. Add Fallback Customer Recreation Logic
- [ ] In controller: If validation fails → clear stale `stripeCustomerId` → recreate
- [ ] Make idempotent (email-based lookup)

### ⏳ 5. Test Implementation
- [ ] Run unit tests: `npm test src/tests/services/stripe.test.js`
- [ ] Manual test: POST `/api/v1/subscriptions/checkout` with `planId: "6-month"`
- [ ] Test affected user: `node scripts/detail-user-full.js 69bc45489755c9aa93aaa267`

### ⏳ 6. DB Cleanup & Prevention
- [ ] Run diagnostic: `node scripts/diagnose-subscriptions.js 69bc45489755c9aa93aaa267`
- [ ] Add webhook/customer validation cron job

### ⏳ 7. Deploy & Monitor
- [ ] Restart server
- [ ] Monitor logs for `/api/v1/subscriptions/checkout`
- [ ] attempt_completion

**Next Action**: Edit `src/services/stripe.js` → Customer validation in `createCheckoutSession()`
