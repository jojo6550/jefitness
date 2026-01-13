# Fix JSON.parse Error in subscriptions.js

## Issue
Payment error: SyntaxError: JSON.parse: unexpected character at line 1 column 1 of the JSON data subscriptions.js:414:17

## Root Cause
Two API endpoint URLs were missing the `/api/v1/` prefix:
1. `/subscriptions/create` → 404 HTML response (not JSON)
2. `/subscriptions/${subscriptionId}/resume` → 404 HTML response (not JSON)

When the browser received HTML error pages and tried to parse them as JSON, the error occurred.

## Solution
Fixed the endpoint URLs to use the correct `/api/v1/subscriptions/` prefix:

### Fix 1: Create Subscription (line 393)
```javascript
// Before:
const response = await fetch(`${window.API_BASE}/subscriptions/create`, {

// After:
const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/create`, {
```

### Fix 2: Resume Subscription (line 676)
```javascript
// Before:
const response = await fetch(`${window.API_BASE}/subscriptions/${subscriptionId}/resume`, {

// After:
const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subscriptionId}/resume`, {
```

## All API Endpoints (Consistent Now)
| Function | Endpoint |
|----------|----------|
| `loadPlans()` | `/api/v1/subscriptions/plans` ✅ |
| `handlePaymentSubmit()` | `/api/v1/subscriptions/create` ✅ FIXED |
| `loadUserSubscriptions()` | `/api/v1/subscriptions/user/current` ✅ |
| `handleConfirmCancel()` | `/api/v1/subscriptions/${id}/cancel` ✅ |
| `resumeSubscription()` | `/api/v1/subscriptions/${id}/resume` ✅ FIXED |
| `downloadInvoices()` | `/api/v1/subscriptions/${id}/invoices` ✅ |

## Status: COMPLETED ✅

