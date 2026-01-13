# JSON Parse Error Fix Plan

## Issue
Payment error: SyntaxError: JSON.parse: unexpected character at line 1 column 1 of the JSON data subscriptions.js:414:17

## Root Cause
Two API endpoints are missing the `/api/v1/` prefix, causing 404 errors that return HTML instead of JSON:
1. `/subscriptions/create` → 404 HTML response
2. `/subscriptions/${subscriptionId}/resume` → 404 HTML response

When the code tries to parse HTML as JSON, it throws the SyntaxError.

## Fix Steps

### Step 1: Fix endpoint URL for creating subscription
- **File**: `public/js/subscriptions.js`
- **Line**: ~352
- **Change**: `${window.API_BASE}/subscriptions/create` → `${window.API_BASE}/api/v1/subscriptions/create`

### Step 2: Fix endpoint URL for resuming subscription
- **File**: `public/js/subscriptions.js`
- **Line**: ~483
- **Change**: `${window.API_BASE}/subscriptions/${subscriptionId}/resume` → `${window.API_BASE}/api/v1/subscriptions/${subscriptionId}/resume`

### Step 3: Update TODO_FIX_JSON_PARSE.md
- Update status to reflect the actual fix applied

## Status
- [x] Identify root cause
- [x] Fix create subscription endpoint URL
- [x] Fix resume subscription endpoint URL
- [ ] Update documentation
- [ ] Test the fix

## Changes Made

### Fix 1: Create Subscription Endpoint
- **File**: `public/js/subscriptions.js`
- **Line 393**: Changed `/subscriptions/create` → `/api/v1/subscriptions/create`

### Fix 2: Resume Subscription Endpoint
- **File**: `public/js/subscriptions.js`
- **Line 676**: Changed `/subscriptions/${subscriptionId}/resume` → `/api/v1/subscriptions/${subscriptionId}/resume`

## Root Cause Explanation
The JSON.parse error occurred because:
1. The frontend made requests to endpoints without the `/api/v1/` prefix
2. These endpoints returned 404 HTML error pages (not JSON)
3. The `handleApiResponse()` function tried to parse HTML as JSON
4. This caused: `SyntaxError: JSON.parse: unexpected character at line 1 column 1`

## All API Endpoints Now Consistent
All endpoints in `subscriptions.js` now use `/api/v1/subscriptions/` prefix:
- ✅ `/api/v1/subscriptions/plans` (loadPlans)
- ✅ `/api/v1/subscriptions/create` (handlePaymentSubmit) - FIXED
- ✅ `/api/v1/subscriptions/user/current` (loadUserSubscriptions)
- ✅ `/api/v1/subscriptions/${id}/cancel` (handleConfirmCancel)
- ✅ `/api/v1/subscriptions/${id}/resume` (resumeSubscription) - FIXED
- ✅ `/api/v1/subscriptions/${id}/invoices` (downloadInvoices)

