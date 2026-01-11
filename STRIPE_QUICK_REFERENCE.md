# Stripe Subscription System - Quick Reference

## Quick Start (5 minutes)

### 1. Environment Setup
```bash
# Copy .env.example to .env and add Stripe keys
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLIC_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_1_MONTH=price_xxx
STRIPE_PRICE_3_MONTH=price_xxx
STRIPE_PRICE_6_MONTH=price_xxx
STRIPE_PRICE_12_MONTH=price_xxx
```

### 2. Start Server
```bash
npm install
npm run dev
```

### 3. Test Flow
1. Register user at `/login.html`
2. Complete account info at `/account.html`
3. Subscribe at `/subscriptions.html`
4. Use test card: `4242 4242 4242 4242`
5. Check webhook processing in Stripe Dashboard

## Core API Endpoints

### Public (No Auth)
- `GET /api/v1/subscriptions/plans` - View plans

### Authenticated
- `POST /api/v1/subscriptions/checkout-session` - Start subscription
- `GET /api/v1/subscriptions/user/current` - View active subscription
- `GET /api/v1/subscriptions/user/all` - View all subscriptions
- `POST /api/v1/subscriptions/:id/update-plan` - Change plan
- `DELETE /api/v1/subscriptions/:id/cancel` - Cancel subscription
- `POST /api/v1/subscriptions/:id/resume` - Resume subscription
- `GET /api/v1/auth/account` - View account
- `PUT /api/v1/auth/account` - Update account/password

## User Data Flow

```
User Signup
    ↓
Email Verification
    ↓
Complete Account (name, email)
    ↓
Stripe Customer Created
    ↓
Click Subscribe
    ↓
Stripe Checkout Session
    ↓
User enters card info
    ↓
Stripe processes payment
    ↓
Webhook: checkout.session.completed
    ↓
Subscription created in DB
    ↓
User redirected to success page
```

## Key Database Fields

### User Model
```javascript
stripeCustomerId      // Stripe cus_xxx
subscriptionId        // Stripe sub_xxx
subscriptionStatus    // active, canceled, past_due
subscriptionPlan      // 1-month, 3-month, etc.
subscriptionPriceId   // Stripe price_xxx
billingEnvironment    // test or production
```

### Subscription Model
```javascript
userId
stripeSubscriptionId  // Unique identifier
status                // Stripe subscription status
currentPeriodEnd      // When subscription renews
cancelAtPeriodEnd     // Pending cancellation?
```

## Testing Checklist

- [ ] User can register
- [ ] User can complete account info
- [ ] User can view subscription plans
- [ ] Checkout creates Stripe customer
- [ ] Checkout creates checkout session
- [ ] Payment processes with test card
- [ ] Webhook processes successfully
- [ ] Subscription created in database
- [ ] User can view active subscription
- [ ] User can update account info
- [ ] User can change password
- [ ] User can cancel subscription
- [ ] User can upgrade/downgrade plan

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Webhook not processing | Verify webhook secret in .env, check Stripe Dashboard |
| Subscription not created | Check webhook logs, verify database connection |
| Checkout redirects to error | Ensure STRIPE_PRICE_xxx env vars are set correctly |
| Email not syncing | Check stripeCustomerId is saved on user |
| Password change fails | Ensure currentPassword is provided and correct |

## File Structure
```
src/
├── models/
│   ├── User.js (updated with Stripe fields)
│   └── Subscription.js (new model)
├── routes/
│   ├── auth.js (added account endpoints)
│   ├── subscriptions.js (new routes)
│   └── webhooks.js (Stripe webhook handlers)
├── services/
│   └── stripe.js (Stripe API wrapper)
└── server.js

public/
├── subscriptions.html (subscription plans)
├── account.html (account settings)
└── subscription-success.html (success confirmation)

tests/
└── stripe.test.js (unit tests)
```

## Webhook Events Handled
- ✓ checkout.session.completed
- ✓ customer.subscription.created
- ✓ customer.subscription.updated
- ✓ customer.subscription.deleted
- ✓ invoice.payment_succeeded
- ✓ invoice.payment_failed

## Security Features
✓ Authentication required for subscriptions
✓ Users can only access their own subscriptions
✓ Webhook signature verification
✓ Password hashing with bcrypt
✓ Email validation
✓ Stripe customer ID linking
✓ Encrypted sensitive fields in database

## Next Steps
1. Add email notifications for subscription events
2. Add usage tracking/limits per plan
3. Add admin dashboard for subscription management
4. Add dunning for failed payments
5. Add proration handling for mid-cycle upgrades
