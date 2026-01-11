# Stripe Subscription System - Testing Guide

## 🧪 Manual Testing Steps

### Test 1: Create a New Subscription

1. **Navigate to Subscriptions Page**
   ```
   http://localhost:10000/subscriptions.html
   ```

2. **Click "Get Started" on any plan**
   - Modal appears with payment form

3. **Fill in Details**
   - Email: `test@example.com`
   - Cardholder Name: `Test User`
   - Card Number: `4242 4242 4242 4242` (Visa test card)
   - Expiry: Any future date (e.g., `12/25`)
   - CVC: Any 3 digits (e.g., `123`)

4. **Click "Complete Payment"**
   - Should see success message
   - Modal closes
   - Subscription appears in "Your Active Subscriptions" section

5. **Verify in Stripe Dashboard**
   - Go to https://dashboard.stripe.com/test/customers
   - Find customer by email
   - Click to view subscription details
   - Should show status: "Active"

6. **Check Database**
   ```javascript
   // In MongoDB
   db.subscriptions.findOne({ 'userId': yourUserId })
   // Should return the subscription document
   ```

---

### Test 2: Upgrade/Downgrade Plan

1. **View Your Subscriptions**
   - Scroll to "Your Active Subscriptions" section
   - Click "Upgrade/Change" button

2. **Select New Plan**
   - Choose "6-Month Plan - $49.99/mo"

3. **Verify Success**
   - Plan updates in the UI
   - Check Stripe Dashboard → subscription details
   - Should show proration charge/credit

---

### Test 3: Cancel Subscription

1. **Click "Cancel" Button**
   - Confirmation modal appears

2. **Choose Cancellation Type**
   - Check "Cancel at end of billing period" (graceful)
   - Click "Yes, Cancel Subscription"

3. **Verify**
   - Status changes to "cancelled"
   - Can still access until period end
   - "Resume" button appears

4. **Resume**
   - Click "Resume" button
   - Status changes back to "active"

---

### Test 4: Failed Payment Webhook

1. **Use Decline Test Card**
   - Card: `4000 0000 0000 0002`
   - This will fail payment

2. **Create Subscription**
   - Subscription is created in `incomplete` status
   - Invoice payment fails
   - Webhook `invoice.payment_failed` is triggered

3. **Check Database**
   ```javascript
   db.subscriptions.findOne({ stripeSubscriptionId: 'sub_xxx' })
   // Should show status: 'past_due'
   ```

4. **Verify Webhook Handling**
   - Check server logs for webhook events
   - Database should be updated

---

### Test 5: Payment Success Webhook

1. **Use Success Test Card**
   - Card: `4242 4242 4242 4242`
   - Create a new subscription

2. **Monitor Webhooks**
   - Go to Stripe Dashboard → Webhooks → Event deliveries
   - Should see multiple events:
     - `customer.subscription.created`
     - `invoice.created`
     - `payment_intent.succeeded`
     - `invoice.payment_succeeded`

3. **Check Database Updates**
   - Subscription status should be `active`
   - Invoice should be recorded in invoices array

---

### Test 6: Invoice Download

1. **View Subscription**
   - Check "Your Active Subscriptions"

2. **Click "Invoices" Button**
   - Opens Stripe-hosted invoice in new tab
   - Should show payment details

---

### Test 7: Multiple Subscriptions**

1. **Create First Subscription**
   - Plan: 1-Month

2. **Log Out & In as Different User**
   - Or use incognito window

3. **Create Second Subscription**
   - Plan: 12-Month
   - Different email

4. **Verify Isolation**
   - Each user sees only their subscriptions
   - API respects authorization

---

## 🔍 API Testing with cURL

### Get Available Plans

```bash
curl -X GET http://localhost:10000/api/v1/subscriptions/plans \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "1-month": { "amount": 999, "displayPrice": "$9.99", ... },
    "3-month": { "amount": 2799, ... },
    ...
  }
}
```

### Create Subscription

```bash
# First, create a payment method
curl -X POST https://api.stripe.com/v1/payment_methods \
  -u sk_test_YOUR_KEY: \
  -d type=card \
  -d "card[number]"=4242424242424242 \
  -d "card[exp_month]"=12 \
  -d "card[exp_year]"=2025 \
  -d "card[cvc]"=123

# Response will include 'id' like: pm_1234567890abcdef

# Now create subscription
curl -X POST http://localhost:10000/api/v1/subscriptions/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "paymentMethodId": "pm_1234567890abcdef",
    "plan": "1-month"
  }'
```

### Get User Subscriptions

```bash
curl -X GET http://localhost:10000/api/v1/subscriptions/user/YOUR_USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Update Plan

```bash
curl -X POST http://localhost:10000/api/v1/subscriptions/SUBSCRIPTION_ID/update-plan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "6-month"
  }'
```

### Cancel Subscription

```bash
curl -X DELETE http://localhost:10000/api/v1/subscriptions/SUBSCRIPTION_ID/cancel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "atPeriodEnd": true
  }'
```

---

## 📋 Test Checklist

### Backend Tests
- [ ] Create subscription with valid card
- [ ] Create subscription with invalid card
- [ ] Get plans endpoint returns correct pricing
- [ ] Get user subscriptions requires auth
- [ ] User cannot access other user's subscriptions
- [ ] Update subscription plan proration calculates correctly
- [ ] Cancel subscription at period end works
- [ ] Cancel subscription immediately works
- [ ] Resume canceled subscription works
- [ ] Invalid plan returns error
- [ ] Invalid subscription ID returns 404

### Webhook Tests
- [ ] customer.subscription.created triggers
- [ ] customer.subscription.updated triggers
- [ ] customer.subscription.deleted triggers
- [ ] invoice.payment_succeeded updates status to active
- [ ] invoice.payment_failed updates status to past_due
- [ ] Invalid webhook signature returns 400
- [ ] Database updates occur on webhook events
- [ ] Duplicate webhook events handled gracefully

### Frontend Tests
- [ ] Plans display with correct pricing
- [ ] "Get Started" button opens payment modal
- [ ] Card element renders in modal
- [ ] Form validation prevents incomplete submission
- [ ] Payment modal closes on success
- [ ] Alert messages display correctly
- [ ] Subscriptions section shows for logged-in users
- [ ] Upgrade/change plan modal displays all plans
- [ ] Cancel confirmation modal displays options
- [ ] Invoices open in new tab
- [ ] Responsive design on mobile

### Security Tests
- [ ] Card data never sent to backend (only payment method ID)
- [ ] API endpoints require auth where appropriate
- [ ] User can't cancel other users' subscriptions
- [ ] Webhook signature verification works
- [ ] CSRF protection (if applicable)
- [ ] Rate limiting on API endpoints
- [ ] Input validation on all endpoints

---

## 🐛 Common Test Issues

### "Stripe is not defined"
- Check that `<script src="https://js.stripe.com/v3/"></script>` is in HTML
- Check that Stripe script loads before subscriptions.js

### "Card element not mounted"
- Ensure modal is shown before accessing cardElement
- Check browser console for errors

### Webhook not triggering
- Verify webhook URL is publicly accessible
- Check webhook secret in `.env`
- Review webhook logs in Stripe Dashboard

### Payment succeeds but subscription not created
- Check server logs for errors
- Verify MongoDB connection
- Check webhook is being received

### "Unauthorized" on subscription update
- Verify JWT token is valid
- Check that user ID matches subscription owner
- Ensure Authorization header is correct format: `Bearer TOKEN`

---

## 📊 Test Data Locations

### Stripe Dashboard
- **Customers**: https://dashboard.stripe.com/test/customers
- **Subscriptions**: https://dashboard.stripe.com/test/subscriptions
- **Invoices**: https://dashboard.stripe.com/test/invoices
- **Events/Webhooks**: https://dashboard.stripe.com/test/webhooks
- **Payments**: https://dashboard.stripe.com/test/payments

### Local Database
```bash
# Connect to MongoDB
mongosh YOUR_MONGO_URI

# View subscriptions
db.subscriptions.find()

# View specific subscription
db.subscriptions.findOne({ stripeSubscriptionId: 'sub_xxx' })

# Update status (for testing)
db.subscriptions.updateOne(
  { _id: ObjectId('...') },
  { $set: { status: 'active' } }
)
```

### Server Logs
```bash
# Run with logging enabled
npm run dev

# Look for:
# ✅ Subscription created
# 📨 Received webhook event
# ✅ Payment recorded
# ❌ Payment failed
```

---

## 🚀 Performance Testing

### Load Test (Optional)

```bash
# Install Apache Bench
# macOS: brew install httpd
# Linux: sudo apt-get install apache2-utils

# Test concurrent requests
ab -n 100 -c 10 http://localhost:10000/api/v1/subscriptions/plans

# Expected: All requests succeed in <500ms
```

---

## ✅ Sign-Off Checklist

Before considering implementation complete:

- [ ] All test steps completed successfully
- [ ] No console errors or warnings
- [ ] Database records created correctly
- [ ] Stripe Dashboard reflects changes
- [ ] Webhooks delivering events
- [ ] Email confirmations sent (if configured)
- [ ] Payment methods secured
- [ ] User isolation verified
- [ ] Error handling tested
- [ ] Mobile responsive verified

---

## 📞 Getting Help

If tests fail:

1. **Check server logs**
   ```bash
   npm run dev
   ```

2. **Check browser console**
   - F12 → Console tab
   - Look for red errors

3. **Check network requests**
   - F12 → Network tab
   - Look for failed API calls

4. **Check Stripe Dashboard**
   - Look for webhook deliveries
   - Review customer data
   - Check invoice status

5. **Review implementation files**
   - `src/routes/subscriptions.js`
   - `src/routes/webhooks.js`
   - `public/js/subscriptions.js`

---

## 📝 Notes

- All test cards require 3D Secure authentication if enabled in account
- Use `4242 4242 4242 4242` for most tests (always succeeds)
- Webhooks require publicly accessible endpoint (use ngrok for local testing)
- Test data persists in Stripe - can be viewed/deleted in Dashboard
