# Stripe Subscription System - Quick Setup (5 Minutes)

## ⚡ Ultra-Quick Start

### 1️⃣ Get Stripe Keys (2 min)

1. Go to https://stripe.com/register
2. Create free account (no credit card needed for testing)
3. Go to https://dashboard.stripe.com/developers/api
4. Copy **Publishable Key** (pk_test_...) and **Secret Key** (sk_test_...)

### 2️⃣ Create Products in Stripe (2 min)

1. Go to https://dashboard.stripe.com/test/products
2. Click "Create product"
3. Create 4 products:

| Name | Price | Billing |
|------|-------|---------|
| JE Fitness - 1 Month | $9.99 | Monthly |
| JE Fitness - 3 Month | $27.99 | Monthly |
| JE Fitness - 6 Month | $49.99 | Monthly |
| JE Fitness - 12 Month | $89.99 | Monthly |

4. For each product, copy the **Price ID** (price_...)

### 3️⃣ Update Your Code (1 min)

Edit `.env` with your keys and price IDs:

```env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PRICE_1_MONTH=price_YOUR_ID_HERE
STRIPE_PRICE_3_MONTH=price_YOUR_ID_HERE
STRIPE_PRICE_6_MONTH=price_YOUR_ID_HERE
STRIPE_PRICE_12_MONTH=price_YOUR_ID_HERE
```

Edit `public/js/subscriptions.js` line ~10:

```javascript
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_KEY_HERE';
```

### ✅ Done! Start Testing

```bash
npm run dev
# Visit: http://localhost:10000/subscriptions.html
```

---

## 🧪 Quick Test

Use this test card:
- **Number**: 4242 4242 4242 4242
- **Expiry**: 12/25
- **CVC**: 123
- **Email**: test@example.com

---

## 📋 Files Created/Modified

| File | Purpose |
|------|---------|
| `src/models/Subscription.js` | Database schema |
| `src/services/stripe.js` | Stripe API methods |
| `src/routes/subscriptions.js` | API endpoints |
| `src/routes/webhooks.js` | Webhook handling |
| `public/subscriptions.html` | Frontend page |
| `public/js/subscriptions.js` | Frontend logic |
| `src/server.js` | (Updated) Added webhook route |
| `.env` | (Updated) Add Stripe keys |

---

## 🚀 Full Feature List

✅ **4 Subscription Tiers**
- 1-month, 3-month, 6-month, 12-month plans
- Display with pricing and savings info

✅ **Secure Payments**
- Stripe Elements for card input
- No card data stored on your server
- PCI compliant

✅ **Complete API**
- Create subscriptions
- View subscriptions
- Update/upgrade plans
- Cancel subscriptions
- Resume canceled subscriptions
- View invoices

✅ **Webhook Integration**
- Payment success/failure handling
- Subscription status updates
- Invoice tracking
- Automatic database sync

✅ **User Management**
- View active subscriptions
- Manage payment methods
- Download invoices
- Cancel with options (immediate or at period end)

✅ **Test Mode Ready**
- Full support for Stripe test cards
- Test webhooks
- No real charges

---

## 📚 Documentation Files

| File | Content |
|------|---------|
| `STRIPE_IMPLEMENTATION_GUIDE.md` | Complete reference guide |
| `STRIPE_QUICK_SETUP.md` | This file |
| `SUBSCRIPTION_TESTING.md` | Testing procedures |

---

## 🔗 Important Links

| Link | Purpose |
|------|---------|
| https://stripe.com/register | Create Stripe account |
| https://dashboard.stripe.com/developers/api | Get API keys |
| https://dashboard.stripe.com/test/products | Create products |
| https://dashboard.stripe.com/test/customers | View test customers |
| https://js.stripe.com/v3/ | Stripe Elements library |

---

## ❓ Common Questions

**Q: Do I need a Stripe account?**
A: Yes, but it's free and takes 30 seconds to create

**Q: Will I be charged for testing?**
A: No, test cards are free. Use `4242...` cards

**Q: What's the webhook for?**
A: Keeps your database in sync with Stripe (payment success/failure)

**Q: Can I change prices later?**
A: Yes, in Stripe Dashboard at any time

**Q: How do I go live?**
A: Replace test keys with live keys in `.env`

**Q: Is card data stored on my server?**
A: No, only the Stripe payment method ID

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Stripe is not defined" | Add `<script src="https://js.stripe.com/v3/"></script>` to HTML |
| "Invalid API Key" | Check `.env` has correct `STRIPE_SECRET_KEY` |
| "Payment modal won't open" | Make sure you're logged in |
| "Payment fails" | Use test card `4242 4242 4242 4242` |

---

## ✨ Next Steps

1. ✅ Get Stripe keys
2. ✅ Create products and copy price IDs
3. ✅ Update `.env` with keys and IDs
4. ✅ Update `public/js/subscriptions.js` with publishable key
5. ✅ Run `npm run dev`
6. ✅ Test at `/subscriptions.html`
7. 🎉 You're done!

---

## 📞 Support

- **Stripe Help**: https://support.stripe.com
- **Stripe Docs**: https://stripe.com/docs
- **Test Cards**: https://stripe.com/docs/testing
- **Email Us**: support@jefitness.com

---

**That's it! Your subscription system is ready.** 🎉
