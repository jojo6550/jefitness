# Stripe Subscription System - Complete Setup Guide

## Overview
This document provides complete setup instructions for the Stripe subscription system with authentication, account management, and webhook handling.

## Architecture

### Database Schema
```
User
├── stripeCustomerId (Stripe Customer ID)
├── subscriptionId (Stripe Subscription ID)
├── subscriptionStatus (active, past_due, canceled, unpaid)
├── subscriptionPlan (1-month, 3-month, 6-month, 12-month, free)
├── subscriptionPriceId (Stripe Price ID)
├── subscriptionStartDate
├── subscriptionEndDate
├── subscriptionRenewalDate
├── billingEnvironment (test, production)
├── hasFreeTier
├── lastPaymentFailure
└── lastPaymentFailureReason

Subscription
├── userId (Reference to User)
├── stripeCustomerId
├── stripeSubscriptionId
├── stripePriceId
├── plan
├── amount (in cents)
├── currency
├── status
├── currentPeriodStart
├── currentPeriodEnd
├── canceledAt
├── cancelAtPeriodEnd
├── billingEnvironment
└── invoices (array of invoice records)
```

## Environment Variables Setup

Add these to your `.env` file:

```bash
# Stripe Keys (get from https://dashboard.stripe.com/developers/api)
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLIC_KEY=pk_test_your_publishable_key_here

# Stripe Webhook Secret (get from https://dashboard.stripe.com/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe Price IDs (create products/prices in Stripe Dashboard)
STRIPE_PRICE_1_MONTH=price_1xxx1month
STRIPE_PRICE_3_MONTH=price_1xxx3month
STRIPE_PRICE_6_MONTH=price_1xxx6month
STRIPE_PRICE_12_MONTH=price_1xxx12month
```

## Step 1: Get Stripe API Keys

1. Sign up at https://stripe.com
2. Go to Dashboard → Developers → API Keys
3. Copy your Secret Key and Publishable Key
4. Add them to your `.env` file

## Step 2: Create Products and Prices

In Stripe Dashboard:

1. Go to Products → Create Product
2. Create 4 products:
   - "1 Month Subscription" → $9.99/month
   - "3 Months Subscription" → $27.99/3 months
   - "6 Months Subscription" → $49.99/6 months
   - "12 Months Subscription" → $89.99/year

3. Copy each Price ID and add to `.env`

## Step 3: Setup Webhook Endpoint

1. Go to Developers → Webhooks
2. Click "Add Endpoint"
3. Enter URL: `https://yourdomain.com/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. Copy the Webhook Secret and add to `.env`

## Step 4: Database Updates

The User and Subscription models have been updated with Stripe fields. Run MongoDB migrations or manually add fields.

## API Endpoints

### Public Endpoints (No Auth Required)

#### GET /api/v1/subscriptions/plans
Returns available subscription plans with pricing
```json
{
  "success": true,
  "data": {
    "plans": {
      "1-month": { "amount": 999, "displayPrice": "$9.99", ... },
      "3-month": { "amount": 2799, "displayPrice": "$27.99", ... },
      ...
    },
    "free": { "amount": 0, ... }
  }
}
```

### Authenticated Endpoints (Auth Required)

#### POST /api/v1/subscriptions/checkout-session
Creates a Stripe Checkout session

**Request:**
```json
{
  "plan": "1-month",
  "successUrl": "https://yourdomain.com/success",
  "cancelUrl": "https://yourdomain.com/cancel"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "cs_live_xxx",
    "url": "https://checkout.stripe.com/xxx"
  }
}
```

#### GET /api/v1/subscriptions/user/current
Gets current user's active subscription

#### GET /api/v1/subscriptions/user/all
Gets all subscriptions for current user

#### POST /api/v1/subscriptions/:subscriptionId/update-plan
Changes subscription plan

#### DELETE /api/v1/subscriptions/:subscriptionId/cancel
Cancels a subscription
```json
{
  "atPeriodEnd": true  // Cancel at end of billing period
}
```

#### POST /api/v1/subscriptions/:subscriptionId/resume
Resumes a canceled subscription

### Account Management Endpoints

#### GET /api/v1/auth/account
Get account information (requires auth)

#### PUT /api/v1/auth/account
Update account information (requires auth)
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

## Webhook Handlers

The system automatically handles:

### checkout.session.completed
- Creates subscription in database
- Updates user subscription fields
- Sets billingEnvironment based on API key

### customer.subscription.created
- Records new subscription in database
- Links to user

### customer.subscription.updated
- Updates subscription status
- Updates billing period dates
- Syncs with user record

### customer.subscription.deleted
- Marks subscription as canceled
- Resets user to free tier

### invoice.payment_succeeded
- Records invoice payment
- Clears payment failure flags

### invoice.payment_failed
- Records payment failure reason
- Updates subscription status to past_due

## Frontend Integration

### Authentication Flow

1. User clicks "Subscribe" button
2. Check if user is authenticated (has token)
3. If not authenticated, redirect to login
4. If authenticated, create checkout session
5. Redirect to Stripe Checkout
6. After payment, user redirected to success page

### Account Editing

1. User navigates to Account Settings
2. Fetch current account info via GET /api/v1/auth/account
3. Allow editing of:
   - First Name
   - Last Name
   - Email (syncs with Stripe)
   - Password (with strength validation)
4. Changes saved via PUT /api/v1/auth/account

### Subscription Display

```javascript
// Get current subscription
const response = await fetch('/api/v1/subscriptions/user/current', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const subscription = await response.json();

// Display plan and renewal date
if (subscription.data.hasSubscription) {
  console.log(`Plan: ${subscription.data.plan}`);
  console.log(`Renews: ${subscription.data.currentPeriodEnd}`);
}
```

## Testing with Stripe Test Mode

### Test Cards

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Decline (CVC): `4000 0000 0000 0069`

Any future expiry date and any 3-digit CVC

### Test Workflow

1. Enable test mode in Stripe Dashboard
2. Use test API keys
3. Create test products/prices
4. Use test webhook secret
5. Subscribe with test card `4242 4242 4242 4242`
6. Check webhooks in Stripe Dashboard → Events

## Production Deployment

1. Get live Stripe keys (production)
2. Create live products and prices
3. Update live webhook endpoint
4. Verify STRIPE_SECRET_KEY and WEBHOOK_SECRET use live credentials
5. Test complete flow before going live

## Security Considerations

✓ All subscription endpoints require authentication
✓ Passwords hashed with bcrypt
✓ Stripe webhook signature verified
✓ User can only access their own subscriptions
✓ Payment method never stored locally
✓ Email synced to Stripe for updates
✓ Sensitive data encrypted in database

## Error Handling

```javascript
try {
  const response = await fetch('/api/v1/subscriptions/checkout-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan: '1-month', ... })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error:', error.error.message);
    // Handle specific error cases
    if (response.status === 401) {
      // Redirect to login
    } else if (response.status === 400) {
      // Show validation errors
    }
  }
} catch (error) {
  console.error('Network error:', error);
}
```

## Monitoring

Check logs for:
- Webhook processing errors
- Failed payment notifications
- Subscription status changes
- Account update failures

```bash
# View logs
npm run dev

# Check webhook events
# Stripe Dashboard → Webhooks → View logs
```

## Troubleshooting

### Webhook not processing
1. Verify STRIPE_WEBHOOK_SECRET is correct
2. Check webhook endpoint URL is accessible
3. View webhook logs in Stripe Dashboard
4. Ensure webhook events are selected in Stripe Dashboard

### Subscription not syncing
1. Verify stripeCustomerId is saved in User
2. Check if webhook is being processed
3. View MongoDB for subscription records
4. Check application logs for errors

### Payment failing
1. Use valid test card for testing
2. Check billing address requirements
3. Verify payment method is attached
4. Check invoice payment status in Stripe

## Support

For Stripe issues: https://support.stripe.com
For application issues: Check logs and error messages
