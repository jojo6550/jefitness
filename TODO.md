# Fix Subscription Flow Integration Tests

## Issues Identified
1. **Plans endpoint**: Returns plans object, test expects array
2. **Webhook endpoint**: Returns JSON, test expects plain text 'Webhook received'
3. **Status endpoint**: Requires stripeSubscriptionId, test doesn't set it
4. **Cancel endpoint**: Sometimes doesn't return message
5. **Access control**: Middleware should work once subscription is set

## Tasks
- [ ] Fix /plans route to return plans as array
- [ ] Fix webhook handler to return plain text response
- [ ] Update /status endpoint logic to check subscription.isActive without stripeSubscriptionId
- [ ] Ensure cancel endpoint always returns message
- [ ] Update test setup for proper subscription fields
- [ ] Run tests to verify fixes
