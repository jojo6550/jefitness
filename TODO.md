# Fix Public Route 401 and Stripe Bugs

## Tasks
- [ ] Move public routes to top in server.js to avoid auth interference
- [ ] Remove apiLimiter from public routes (/api/v1/products, /api/v1/subscriptions)
- [ ] Add null priceId checks in createProductCheckoutSession
- [ ] Export getStripe from stripe.js
- [ ] Update products.js to check for STRIPE_SECRET_KEY before calling Stripe
- [ ] Filter out products with null priceId in GET /products
