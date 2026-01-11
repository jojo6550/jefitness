# Fix Failing Stripe Tests

## Issues Identified
1. **GET /api/v1/subscriptions/user/current**: Missing `hasSubscription: true` in response for active subscriptions
2. **PUT /api/v1/auth/account**: Stripe customer update not called due to missing STRIPE_SECRET_KEY in test environment
3. **DELETE /api/v1/subscriptions/:subscriptionId/cancel (immediate)**: Response status undefined after immediate cancellation
4. **DELETE /api/v1/subscriptions/:subscriptionId/cancel (authorization)**: Invalid password hash in test user creation

## Tasks
- [x] Fix subscriptions route to include hasSubscription field
- [x] Update auth route to handle Stripe updates in test environment
- [x] Fix cancel subscription response structure
- [x] Fix test user password hashing
