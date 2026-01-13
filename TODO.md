# TODO: Replace isLocalhost base URL logic with ApiConfig.getAPI_BASE()

## Files to Update (27 total)
- [ ] public/pages/subscriptions.html
- [ ] public/pages/products.html
- [ ] public/pages/partials/navbar.html
- [ ] public/pages/checkout-success.html
- [ ] public/js/auth.js
- [ ] public/js/profile.js
- [ ] public/js/subscriptions.js
- [ ] public/js/trainer-appointments.js
- [ ] public/js/view-statistics.js
- [ ] public/js/trainer-dashboard.js
- [ ] public/js/trainer-clients.js
- [ ] public/js/sleep-tracker.js
- [ ] public/js/session-check.js
- [ ] public/js/role-guard.js
- [ ] public/js/reports.js
- [ ] public/js/program-details.js
- [ ] public/js/product-cart.js
- [ ] public/js/nutrition-logger.js
- [ ] public/js/medical-documents.js
- [ ] public/js/dashboard.js
- [ ] public/js/dashboard-notifications.js
- [ ] public/js/checkout.js
- [ ] public/js/cart.js
- [ ] public/js/admin-notifications.js
- [ ] public/js/admin-dashboard.js

## Plan
Replace:
```

const API_BASE = window.ApiConfig.getAPI_BASE();```
With:
```
window.API_BASE = window.ApiConfig.getAPI_BASE();
```

And update any variable references from API_BASE/API_BASE to API_BASE.
