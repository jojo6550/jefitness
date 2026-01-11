# Stripe Subscription System - Configuration Checklist

## 🔧 Pre-Implementation Checklist

### 1. Stripe Account Setup
- [ ] Create Stripe account at https://stripe.com
- [ ] Verify email address
- [ ] Navigate to test mode (toggle in top-right)
- [ ] Save API keys somewhere safe

### 2. API Keys
- [ ] Copy **Publishable Key** (pk_test_...)
- [ ] Copy **Secret Key** (sk_test_...)
- [ ] Store keys in `.env` file (NEVER commit to git)
- [ ] Use `.env.example` as reference

### 3. Create Products and Prices
- [ ] Go to https://dashboard.stripe.com/test/products
- [ ] Create **JE Fitness - 1 Month** - $9.99/month
- [ ] Create **JE Fitness - 3 Month** - $27.99/month
- [ ] Create **JE Fitness - 6 Month** - $49.99/month
- [ ] Create **JE Fitness - 12 Month** - $89.99/month
- [ ] Copy each **Price ID** (price_...)

### 4. Environment Configuration

**File: `.env`**
- [ ] `STRIPE_SECRET_KEY=sk_test_...`
- [ ] `STRIPE_PRICE_1_MONTH=price_...`
- [ ] `STRIPE_PRICE_3_MONTH=price_...`
- [ ] `STRIPE_PRICE_6_MONTH=price_...`
- [ ] `STRIPE_PRICE_12_MONTH=price_...`

**File: `public/js/subscriptions.js` (line ~10)**
- [ ] Update `const STRIPE_PUBLIC_KEY = 'pk_test_...'`

### 5. Database
- [ ] MongoDB connection is working
- [ ] `src/models/Subscription.js` model is created
- [ ] Database indexes are created

### 6. Backend Code
- [ ] `src/services/stripe.js` is implemented
- [ ] `src/routes/subscriptions.js` is implemented
- [ ] `src/routes/webhooks.js` is implemented
- [ ] `src/server.js` includes webhook route: `app.use('/webhooks', require('./routes/webhooks'))`
- [ ] All dependencies installed: `npm install stripe`

### 7. Frontend Code
- [ ] `public/subscriptions.html` is created
- [ ] `public/js/subscriptions.js` is created
- [ ] Stripe.js library is loaded in HTML
- [ ] Bootstrap CSS/JS are loaded

---

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Visit `/subscriptions.html` - page loads without errors
- [ ] All 4 plans display with correct pricing
- [ ] "Get Started" button can be clicked
- [ ] Payment modal opens when button is clicked

### Payment Processing
- [ ] Enter test card: `4242 4242 4242 4242`
- [ ] Enter email: `test@example.com`
- [ ] Click "Complete Payment"
- [ ] Payment succeeds
- [ ] Success message appears
- [ ] Subscription appears in "Your Subscriptions" section

### Subscription Management
- [ ] View subscription details (plan, next billing date)
- [ ] Click "Upgrade/Change" - modal opens with plan options
- [ ] Select different plan - subscription updates
- [ ] Click "Cancel" - confirmation modal appears
- [ ] Cancel subscription - status changes
- [ ] Click "Resume" on canceled subscription
- [ ] Invoices load and can be opened

### Error Handling
- [ ] Use decline test card: `4000 0000 0000 0002`
- [ ] Payment fails gracefully with error message
- [ ] Invalid email shows validation error
- [ ] Missing required fields shows error
- [ ] Invalid plan ID returns error

### API Testing
- [ ] GET `/api/v1/subscriptions/plans` returns all plans
- [ ] POST `/api/v1/subscriptions/create` creates subscription
- [ ] GET `/api/v1/subscriptions/user/{id}` returns user subs
- [ ] POST `/api/v1/subscriptions/{id}/update-plan` updates plan
- [ ] DELETE `/api/v1/subscriptions/{id}/cancel` cancels
- [ ] POST `/api/v1/subscriptions/{id}/resume` resumes

---

## 🔌 Webhook Configuration

### Setup Webhook Endpoint
- [ ] Go to https://dashboard.stripe.com/test/webhooks
- [ ] Click "Add an endpoint"
- [ ] Enter URL: `https://yourdomain.com/webhooks/stripe`
  - *For local testing, use ngrok: `ngrok http 10000` then use ngrok URL*
- [ ] Select events:
  - [ ] `customer.created`
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.created`
  - [ ] `invoice.payment_succeeded`
  - [ ] `invoice.payment_failed`
  - [ ] `payment_intent.succeeded`
  - [ ] `payment_intent.payment_failed`
- [ ] Copy webhook secret
- [ ] Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_test_...`

### Test Webhooks
- [ ] Create a test subscription
- [ ] Check Stripe Dashboard → Webhooks → Event deliveries
- [ ] Verify events are being received
- [ ] Check server logs for webhook processing
- [ ] Verify subscription status updates in database

---

## 📱 Browser Testing

### Desktop (Chrome/Firefox/Safari)
- [ ] Subscription page loads
- [ ] Plans display correctly
- [ ] Payment modal is responsive
- [ ] Card validation works
- [ ] Form submission works
- [ ] Success/error alerts appear
- [ ] Subscriptions section updates

### Mobile (iOS/Android)
- [ ] Responsive layout works
- [ ] Payment form is accessible
- [ ] Buttons are clickable
- [ ] Modal works on small screens
- [ ] Keyboard doesn't obscure inputs

### Browser Console
- [ ] No JavaScript errors
- [ ] No console warnings about deprecated code
- [ ] Stripe library loads correctly
- [ ] API calls show in Network tab

---

## 🔐 Security Checklist

### API Security
- [ ] All protected endpoints require authentication token
- [ ] Users can only access their own subscriptions
- [ ] Secret key is not exposed in frontend code
- [ ] Webhook signature is verified
- [ ] Input validation on all endpoints
- [ ] Rate limiting is enabled

### Data Security
- [ ] Card data never sent to backend (only payment method ID)
- [ ] Stripe handles all sensitive payment data
- [ ] Subscription data encrypted in transit (HTTPS)
- [ ] Database access controlled
- [ ] No sensitive data in logs

### Environment Security
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` has placeholder values (no real keys)
- [ ] Production uses live keys (when deployed)
- [ ] Webhook secret matches Stripe dashboard
- [ ] HTTPS enabled (required for production)

---

## 📊 Production Deployment Checklist

### Before Going Live
- [ ] Switch to **Live Mode** in Stripe (toggle in dashboard)
- [ ] Get **Live API Keys** (starts with `pk_live_` and `sk_live_`)
- [ ] Create live products with live prices
- [ ] Update `.env` with live keys and prices
- [ ] Update webhook endpoint URL to production domain
- [ ] Set up SSL/TLS certificate (HTTPS required)
- [ ] Test full checkout with live card (use your own card)
- [ ] Set up email notifications for failed payments
- [ ] Set up monitoring and alerts
- [ ] Review error handling and logging

### Post-Deployment
- [ ] Monitor webhook deliveries in Stripe Dashboard
- [ ] Monitor application logs for errors
- [ ] Test cancellation flow
- [ ] Test upgrade flow
- [ ] Verify payment success emails are sent
- [ ] Monitor failed payment alerts
- [ ] Check database backups are working
- [ ] Set up monitoring for high memory usage
- [ ] Document any customizations made

---

## 📚 Documentation Completed

- [ ] `STRIPE_IMPLEMENTATION_GUIDE.md` - Complete reference
- [ ] `STRIPE_QUICK_SETUP.md` - Quick start guide
- [ ] `SUBSCRIPTION_TESTING.md` - Testing procedures
- [ ] `SUBSCRIPTION_API_EXAMPLES.md` - Code examples
- [ ] `CONFIGURATION_CHECKLIST.md` - This file
- [ ] `.env.example` - Environment template
- [ ] `STRIPE_QUICK_SETUP.md` - 5-minute setup

---

## 🆘 Troubleshooting Resources

| Issue | Location |
|-------|----------|
| API errors | Check server logs: `npm run dev` |
| Payment failures | Check browser console (F12) |
| Webhook issues | Stripe Dashboard → Webhooks → Event deliveries |
| Database issues | MongoDB connection logs |
| Card validation | Stripe documentation |
| Authorization errors | Check JWT token in localStorage |

---

## ✅ Sign-Off

Once you've completed this checklist, your subscription system is ready!

**System Status: [ ] READY FOR PRODUCTION**

Date completed: _______________
Tested by: _______________
Approved by: _______________

---

## 📞 Support Contacts

- **Stripe Support**: https://support.stripe.com
- **Stripe Status**: https://status.stripe.com
- **Application Logs**: `npm run dev`
- **Database Logs**: MongoDB Atlas console
- **Email Support**: support@jefitness.com

---

## 📝 Notes Section

Use this space for any custom configurations or notes:

```
_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________
```
