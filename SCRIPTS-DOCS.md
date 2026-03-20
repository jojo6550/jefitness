# Stripe Plans Sync Documentation
Production-ready Stripe Products/Prices → MongoDB sync solution.

## 📋 Files Added

### 1. `src/models/StripePlan.js`
**Mongoose schema for stripePlans collection.**
- Unique `stripePriceId`, full mapping from Stripe Price + Product
- Indexes: `stripePriceId`, `lookupKey`, `active + unitAmount`
- Fields: All per spec (unitAmount cents, metadata, timestamps)

### 2. `scripts/sync-stripe-to-db.js`
**Standalone sync script.**
- Fetches `stripe.prices.list({active:true, recurring, expand:['data.product']})`
- Upserts each → MongoDB by `stripePriceId`
- Cleanup: Archives inactive, removes missing
- Logs: Created/Updated/Removed counts
**Usage:** `node scripts/sync-stripe-to-db.js`

### 3. `scripts/cli-commands.js`
**CLI wrapper.**
```
npm run sync:plans        # Full sync
npm run list:plans        # Pretty table
node cli add-lookup pro-monthly price_1xxx  # Set lookup_key
node cli remove price_1xxx  # Delete one
```
Exports `syncStripeToDB()` for reuse.

### 4. `scripts/add-webhook-support.js`
**Standalone Express webhook server.**
- Listens `/webhook/plans` for `price.*`/`product.*` events
- Partial syncs affected price(s)
- Use `ngrok http 3001` + Stripe CLI forward
**Usage:** `npm run webhook:plans`
**Integrate:** `app.use('/api/webhook/plans', require('./scripts/add-webhook-support'));`

### 5. `src/routes/plans.js`
**API for frontend (public).**
```
GET /api/v1/plans           # All active, sorted price asc
GET /api/v1/plans/pro-monthly  # By lookup_key
?lookupKey=pro&active=true
```
Formatted w/ `displayPrice`. Mount in server.js: `app.use('/api/v1/plans', require('./routes/plans'));`

## 🚀 Workflow

1. **Setup** `.env`: `STRIPE_SECRET_KEY`, `MONGODB_URI`, `STRIPE_WEBHOOK_SECRET`
2. **Initial sync** `npm run sync:plans`
3. **Verify** `npm run list:plans`
4. **API live** Add plans route to server.js, frontend queries `/api/v1/plans`
5. **Real-time** Run webhook server OR integrate into existing webhooks.js
6. **Cron** Add to jobs.js: `cron.schedule('0 */6 * * *', syncStripeToDB);` (6hr)

## ✅ Frontend Example
```js
// List
const { plans } = await fetch('/api/v1/plans').then(r=>r.json());
// Single
const proMonthly = await fetch('/api/v1/plans/pro-monthly').then(r=>r.json());
console.log(proMonthly.plan.displayPrice); // $29.99
```

## 🔧 Maintenance
- `npm run sync:plans` daily/weekly
- Lookup keys manual via CLI
- Webhook auto-syncs changes

Stripe = source of truth. MongoDB = fast frontend reads. Zero hardcoding.
