<<<<<<< Updated upstream
# Fix Failing Subscription Tests

## Steps:
- [ ] 1. Edit src/tests/unit/subscriptionController.test.js: Update two failing expect() calls for createOrRetrieveCustomer to match 3 args (email, null, {userId})
- [ ] 2. Run tests to verify both tests pass
- [ ] 3. Complete task

=======
# Fix Router TypeError in subscriptions.js

## Plan Steps
- [x] Create TODO.md with plan breakdown ✅
- [x] Step 1: Implement cancelQueuedPlan in src/controllers/subscriptionController.js ✅
- [ ] Step 2: Verify edit with read_file
- [ ] Step 3: Restart server and test endpoint
- [ ] Step 4: Run lint and complete

Current status: Handler implemented in src/controllers/subscriptionController.js. Added cancelQueuedPlan to delete queued (trialing/isQueuedPlan) subscriptions from DB. Also exported for testing.

Next: Restart server (npm start or nodemon), test DELETE /api/v1/subscriptions/queued with valid auth token and queued sub.

>>>>>>> Stashed changes
