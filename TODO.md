# JE Fitness Subscription Refactor TODO
## Status: 🔄 In Progress (0/14 steps complete)

## Logical Steps from Approved Plan

✅ **Phase 1: Core Infrastructure COMPLETE (4/4)**

- [x] 1. Create `src/services/subscriptionService.js` with all required functions (getOrCreateSubscription, hasActiveAccess, checkAndHandleExpiration, createOrUpdateFromStripe, cancelSubscription, setSubscriptionState)
- [x] 2. Simplify `src/models/Subscription.js` schema (keep only: userId, state, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, updatedAt)
- [x] 3. Update `src/models/User.js` (remove subscriptionStatus, update methods to use service)
- [x] 4. Remove subscription cron jobs from `src/jobs.js`

### Phase 2: Middleware & Controllers (6/6) - COMPLETE
- [x] 5. Refactor `src/middleware/subscriptionAuth.js` to use service + pure state+periodEnd logic
- [x] 6. Refactor `src/controllers/subscriptionController.js` to use service exclusively
- [x] 7. Refactor `src/controllers/adminController.js` subscription functions to use service
- [x] 8. Refactor `src/routes/webhooks.js` handlers to use service.createOrUpdateFromStripe()
- [x] 9. Update routes if needed (minimal)
- [x] 10. Remove User subscriptionStatus syncs everywhere (deprecated subscriptionExpiry.js stubbed)

### Phase 3: Testing & Cleanup (0/4)
- [ ] 11. Verify UTC timestamps, idempotency
- [ ] 12. Test core flows: create→cancel→access→expiration→webhook sync
- [ ] 13. Frontend status display updates (public/js files if complex)
- [ ] 14. Final validation + attempt_completion

**Next Step: Frontend updates + testing**

**Instructions**: Edit this file after completing each step. Check off [x] when done.

### Phase 3: Testing & Cleanup (0/4)
- [ ] 11. Verify UTC timestamps, idempotency
- [ ] 12. Test core flows: create→cancel→access→expiration→webhook sync
- [ ] 13. Frontend status display updates (public/js files if complex)
- [ ] 14. Final validation + attempt_completion

**Next Step: 5. Refactor subscriptionAuth middleware**

**Instructions**: Edit this file after completing each step. Check off [x] when done.

### Phase 2: Middleware & Controllers (4/6)
- [ ] 5. Refactor `src/middleware/subscriptionAuth.js` to use service + pure state+periodEnd logic
- [ ] 6. Refactor `src/controllers/subscriptionController.js` to use service exclusively
- [ ] 7. Refactor `src/controllers/adminController.js` subscription functions to use service
- [ ] 8. Refactor `src/routes/webhooks.js` handlers to use service.createOrUpdateFromStripe()
- [ ] 9. Update routes if needed (minimal)
- [ ] 10. Remove User subscriptionStatus syncs everywhere

### Phase 3: Testing & Cleanup (2/4)
- [ ] 11. Verify UTC timestamps, idempotency
- [ ] 12. Test core flows: create→cancel→access→expiration→webhook sync
- [ ] 13. Frontend status display updates (public/js files if complex)
- [ ] 14. Final validation + attempt_completion

**Next Step: 1. Create subscriptionService.js**

**Instructions**: Edit this file after completing each step. Check off [x] when done. Use tools to read affected files before editing.

