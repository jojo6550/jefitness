# Complete Stripe Subscription System Implementation Guide

## 📋 Overview

This guide provides a complete implementation of a Stripe subscription system for the JE Fitness application. The system includes:

- ✅ 4 Subscription tiers (1-month, 3-month, 6-month, 12-month)
- ✅ Stripe Elements payment processing
- ✅ Complete backend API endpoints
- ✅ Frontend subscription management page
- ✅ Webhook handling for payment events
- ✅ Database models for persistence
- ✅ Test mode support for development

---

## 🚀 Quick Start

### Step 1: Get Your Stripe Keys

1. Create a Stripe account at https://stripe.com
2. Go to Dashboard → Developers → API Keys
3. Copy your **Publishable Key** (starts with `pk_`) and **Secret Key** (starts with `sk_`)
4. Make sure you're using **Test Mode** (toggle at top-right of Stripe dashboard)

### Step 2: Update Environment Variables

Edit your `.env` file:

```env
# Stripe API Keys (from https://dashboard.stripe.com/developers/api)
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_PUBLIC_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE

# Price IDs (You'll get these from Stripe)
STRIPE_PRICE_1_MONTH=price_1NfYT7GBrdnKY4ig...
STRIPE_PRICE_3_MONTH=price_1NfYT7GBrdnKY4ig...
STRIPE_PRICE_6_MONTH=price_1NfYT7GBrdnKY4ig...
STRIPE_PRICE_12_MONTH=price_1NfYT7GBrdnKY4ig...

# Webhook Secret (You'll get this after setting up webhook)
STRIPE_WEBHOOK_SECRET=whsec_test_YOUR_WEBHOOK_SECRET_HERE
```

### Step 3: Create Products and Prices in Stripe

1. Go to https://dashboard.stripe.com/test/products
2. Click "Create product"
3. Fill in:
   - **Name**: "JE Fitness - 1 Month Subscription"
   - **Price**: 9.99
   - **Billing period**: Monthly
4. Repeat for 3-month, 6-month, and 12-month plans
5. Copy the **Price ID** for each and paste into `.env`

### Step 4: Set Up Webhooks

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/webhooks/stripe`
4. Select events:
   - `customer.created`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.created`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy the webhook secret and add to `.env` as `STRIPE_WEBHOOK_SECRET`

### Step 5: Update Frontend Code

In `public/js/subscriptions.js`, replace the Stripe public key:

```javascript
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_PUBLISHABLE_KEY_HERE';
```

### Step 6: Install Dependencies

All required packages should already be installed. If not:

```bash
npm install stripe express-validator
```

### Step 7: Start Your Server

```bash
npm run dev
```

Then visit: `http://localhost:10000/subscriptions.html`

---

## 🧪 Test Payments

Use these Stripe test card numbers:

| Card Type | Number | CVC | Date |
|-----------|--------|-----|------|
| Visa (Success) | 4242 4242 4242 4242 | Any 3 digits | Any future date |
| Mastercard (Success) | 5555 5555 5555 4444 | Any 3 digits | Any future date |
| Visa (Decline) | 4000 0000 0000 0002 | Any 3 digits | Any future date |
| Visa (3D Secure) | 4000 0000 0000 3220 | Any 3 digits | Any future date |

For 3D Secure cards, you'll be asked to authenticate. Use `4242` as the code.

---

## 📁 File Structure

```
src/
├── models/
│   ├── Subscription.js          # Database model for subscriptions
│   └── User.js                  # (Existing) User model
├── services/
│   └── stripe.js                # Stripe API service methods
├── routes/
│   ├── subscriptions.js          # API endpoints for subscriptions
│   └── webhooks.js              # Stripe webhook handling
├── middleware/
│   └── auth.js                  # (Existing) Authentication
└── server.js                    # (Updated) Main server file

public/
├── subscriptions.html           # Subscription plans page
└── js/
    └── subscriptions.js         # Frontend subscription logic
```

---

## 🔌 API Endpoints

### Get Available Plans

```http
GET /api/v1/subscriptions/plans
```

**Response:**
```json
{
  "success": true,
  "data": {
    "1-month": {
      "amount": 999,
      "displayPrice": "$9.99",
      "duration": "1 Month"
    },
    "3-month": {
      "amount": 2799,
      "displayPrice": "$27.99",
      "duration": "3 Months",
      "savings": "$2.98"
    },
    ...
  }
}
```

### Create Subscription

```http
POST /api/v1/subscriptions/create
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "email": "user@example.com",
  "paymentMethodId": "pm_xxxx...",
  "plan": "1-month"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "_id": "...",
      "userId": "...",
      "stripeSubscriptionId": "sub_xxxx...",
      "plan": "1-month",
      "status": "active",
      "currentPeriodEnd": "2024-02-15T...",
      ...
    },
    "customer": {
      "id": "cus_xxxx...",
      "email": "user@example.com"
    }
  }
}
```

### Get User Subscriptions

```http
GET /api/v1/subscriptions/user/{userId}
Authorization: Bearer {TOKEN}
```

### Update Subscription Plan

```http
POST /api/v1/subscriptions/{subscriptionId}/update-plan
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "plan": "6-month"
}
```

### Cancel Subscription

```http
DELETE /api/v1/subscriptions/{subscriptionId}/cancel
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "atPeriodEnd": false
}
```

### Resume Subscription

```http
POST /api/v1/subscriptions/{subscriptionId}/resume
Authorization: Bearer {TOKEN}
```

### Get Invoices

```http
GET /api/v1/subscriptions/{subscriptionId}/invoices
Authorization: Bearer {TOKEN}
```

---

## 🎯 Frontend Features

### Subscription Plans Page (`/subscriptions.html`)

- **View Plans**: Display all 4 subscription tiers with pricing and features
- **Select Plan**: Click "Get Started" to purchase a subscription
- **Payment Modal**: Secure card input using Stripe Elements
- **View Active Subscriptions**: See current subscriptions and details
- **Upgrade/Downgrade**: Change to a different plan
- **Cancel Subscription**: Cancel at period end or immediately
- **Resume Subscription**: Resume a canceled subscription
- **View Invoices**: Download or view past invoices

### Key JavaScript Functions

```javascript
// Load available plans
loadPlans()

// Select a plan for purchase
selectPlan(plan)

// Submit payment
handlePaymentSubmit(event)

// Load user's subscriptions
loadUserSubscriptions()

// Change subscription plan
changeSubscriptionPlan(newPlan)

// Cancel subscription
handleConfirmCancel()

// Resume subscription
resumeSubscription(subscriptionId)

// Download invoices
downloadInvoices(subscriptionId)
```

---

## 🔐 Security Considerations

### 1. **API Key Security**
- ✅ Secret keys are stored in `.env` (never committed to git)
- ✅ Publishable keys are safe to expose in frontend
- ✅ Use `.env.example` as template without secrets

### 2. **Webhook Verification**
```javascript
// In webhooks.js - signature is verified
event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
```

### 3. **User Authorization**
```javascript
// Endpoints verify user ownership
if (req.user.user.id !== userId) {
  return res.status(403).json({ error: 'Unauthorized' });
}
```

### 4. **PCI Compliance**
- ✅ Card data is processed by Stripe, never touches your servers
- ✅ Only store payment method IDs and subscription IDs
- ✅ Stripe Elements handles all sensitive data

### 5. **HTTPS Required**
- Always use HTTPS in production
- Webhook endpoints must be publicly accessible
- Stripe will reject HTTP webhooks in production

---

## 🐛 Troubleshooting

### Issue: "Stripe is not defined"

**Solution**: Make sure `<script src="https://js.stripe.com/v3/"></script>` is in your HTML

### Issue: "Invalid API Key"

**Solution**: Check `.env` file and make sure:
- `STRIPE_SECRET_KEY` is correct (starts with `sk_test_`)
- It's loaded before the server starts
- It matches your test account (not production)

### Issue: Webhooks not being received

**Solution**:
1. Check webhook secret in `.env`
2. Use `ngrok` to tunnel localhost: `ngrok http 10000`
3. Update webhook URL to `https://your-ngrok-url/webhooks/stripe`
4. Check Stripe Dashboard → Webhooks → Event deliveries for errors

### Issue: Payment succeeds in Stripe but doesn't create subscription in DB

**Solution**:
1. Check webhook is triggering (`console.log` in webhook handlers)
2. Verify database connection is working
3. Check MongoDB collections for `subscriptions` document
4. Review server logs for database errors

### Issue: "Stripe Elements not mounted"

**Solution**: Ensure the modal is shown before mounting the element:
```javascript
// Elements are mounted when modal is displayed
paymentModal.addEventListener('shown.bs.modal', () => {
  cardElement.mount('#cardElement');
});
```

---

## 📊 Database Schema

### Subscription Model (`src/models/Subscription.js`)

```javascript
{
  userId: ObjectId,                          // Reference to User
  stripeCustomerId: String,                  // Stripe cus_xxx
  stripeSubscriptionId: String,              // Stripe sub_xxx
  plan: String,                              // '1-month', '3-month', etc.
  stripePriceId: String,                     // Stripe price ID
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  status: String,                            // active, canceled, past_due, etc.
  canceledAt: Date,
  cancelAtPeriodEnd: Boolean,
  paymentMethodId: String,                   // Stripe payment method ID
  amount: Number,                            // In cents
  currency: String,                          // 'usd', 'eur', etc.
  invoices: [{
    stripeInvoiceId: String,
    amount: Number,
    status: String,
    paidAt: Date,
    url: String
  }],
  createdAt: Date,
  updatedAt: Date,
  lastWebhookEventAt: Date
}
```

---

## 🚢 Deployment Checklist

### Before Going Live

- [ ] Switch to production API keys in Stripe
- [ ] Update `.env` with production keys
- [ ] Update Stripe webhook URL to production domain
- [ ] Remove test card numbers from documentation
- [ ] Enable HTTPS/SSL certificate
- [ ] Test full checkout flow with real card
- [ ] Set up email notifications for payment failures
- [ ] Test webhook handling with real events
- [ ] Set up monitoring/alerting for failed payments
- [ ] Review data retention policies (GDPR/HIPAA)
- [ ] Set up backup for subscription data

### Environment Variables (Production)

```env
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY
STRIPE_PUBLIC_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
STRIPE_PRICE_1_MONTH=price_live_xxx
STRIPE_PRICE_3_MONTH=price_live_xxx
STRIPE_PRICE_6_MONTH=price_live_xxx
STRIPE_PRICE_12_MONTH=price_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_live_xxx
```

---

## 📧 Email Notifications (Optional)

Add these functions to send emails on subscription events:

```javascript
// In webhooks.js - uncomment and implement
async function handleInvoicePaymentSucceeded(invoice) {
  // sendPaymentSuccessEmail(userId, invoice);
}

async function handleInvoicePaymentFailed(invoice) {
  // sendPaymentFailureEmail(userId, invoice);
}

async function handleSubscriptionDeleted(subscription) {
  // sendCancellationConfirmationEmail(userId, subscription);
}
```

---

## 📚 Additional Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Test Mode Guide**: https://stripe.com/docs/testing
- **Webhooks Guide**: https://stripe.com/docs/webhooks
- **Stripe Elements**: https://stripe.com/docs/stripe-js/elements/setup
- **Subscription API**: https://stripe.com/docs/api/subscriptions

---

## 💬 Support

For issues with this implementation:
1. Check the troubleshooting section above
2. Review server logs: `npm run dev`
3. Check browser console for frontend errors
4. Test with Stripe's test cards
5. Check webhook delivery in Stripe Dashboard

For Stripe-specific issues:
- Contact Stripe Support: https://support.stripe.com
- Check Stripe Status: https://status.stripe.com

---

## 📝 License

This implementation is part of the JE Fitness application.
