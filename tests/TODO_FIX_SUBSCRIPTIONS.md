# Subscription Tests Fix Plan

## Issues Identified
1. Email validation missing in `/create` endpoint validation middleware
2. Route uses `getStripe()` directly instead of mocked `createOrRetrieveCustomer` and `createSubscription` functions
3. Error handling doesn't properly propagate Stripe errors

## Fixes to Implement

### Step 1: Add email validation to POST /create endpoint
- Add `body('email').isEmail().normalizeEmail()` to validation chain

### Step 2: Refactor /create endpoint to use service functions
- Use `createOrRetrieveCustomer()` instead of direct Stripe calls
- Use `createSubscription()` instead of direct Stripe calls
- Handle payment method attach errors properly

### Step 3: Verify test expectations
- Ensure validation errors return 400 with "Validation failed" message
- Ensure Stripe errors return 500 with "Failed to create subscription" message

## Test Status After Fix
- should create subscription successfully for 1-month plan ✓
- should create subscription successfully for 3-month plan ✓
- should create subscription successfully for 6-month plan ✓
- should create subscription successfully for 12-month plan ✓
- should return 400 for invalid email ✓
- should return 400 for missing paymentMethodId ✓
- should return 400 for invalid plan ✓
- should return 500 for Stripe customer creation error ✓
- should return 500 for Stripe subscription creation error ✓
- should retrieve customer subscriptions successfully ✓
- should return 400 for invalid customerId ✓
- should return 500 for Stripe API error ✓

