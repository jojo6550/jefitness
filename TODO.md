# Subscription System Fix Plan

## Information Gathered
- Navbar fetches `/api/v1/subscriptions/status` which returns 400 Bad Request because the endpoint doesn't exist.
- Backend has `/api/v1/subscriptions/user/current` which returns subscription data.
- Free users: `{ success: true, data: { plan: 'free', status: 'inactive', hasSubscription: false } }`
- Active users: `{ success: true, data: { ...subscription, isActive: true, hasActiveSubscription: true } }`
- Missing `currentPeriodEnd` in test subscriptions is handled by defaulting to 30 days later in subscriptions.js.
- API_BASE is correctly set for production.

## Plan
1. Update `public/js/navbar-subscription.js` to use `/api/v1/subscriptions/user/current` endpoint.
2. Adjust response handling to check `subscription.plan` instead of `hasSubscription`.
3. Change error message from 'Error' to 'Subscription Required'.
4. Add debug logging in development (when API_BASE includes 'localhost').
5. Update inline script in `public/pages/partials/navbar.html` accordingly.
6. Ensure graceful handling when subscription data cannot be fetched.

## Dependent Files to be edited
- `public/js/navbar-subscription.js`
- `public/pages/partials/navbar.html`

## Followup steps
- Test the navbar subscription status display in both development and production.
- Verify that active subscriptions show correctly.
- Confirm error handling shows 'Subscription Required' on fetch failures.
