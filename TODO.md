# TODO: Replace isLocalhost base URL logic with ApiConfig.getBaseURL()

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
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';
```
With:
```
const API_BASE = window.ApiConfig.getBaseURL();
```

And update any variable references from API_BASE_URL/baseUrl to API_BASE.
