# Products Page Refactoring - TODO

## Phase 1: Frontend - Products Page ✅ COMPLETED
- [x] 1.1 Add auth check (redirect to login if not authenticated)
- [x] 1.2 Add quantity input/stepper (+/- buttons) to each product card
- [x] 1.3 Make "Add to Cart" buttons functional with quantity
- [x] 1.4 Add cart badge to navbar with item count
- [x] 1.5 Show toast notifications when items added to cart
- [x] 1.6 Add logout button in navbar

## Phase 2: Backend - Cart API Routes ✅ COMPLETED
- [x] 2.1 Create `src/routes/cart.js` with product cart endpoints
- [x] 2.2 POST /api/cart/products - Add product to cart with quantity
- [x] 2.3 PUT /api/cart/products/:id - Update product quantity
- [x] 2.4 DELETE /api/cart/products/:id - Remove product from cart
- [x] 2.5 GET /api/cart - Get all products in cart
- [x] 2.6 Mount cart routes in server.js

## Phase 3: Frontend - Cart Page ✅ COMPLETED
- [x] 3.1 Create `public/js/product-cart.js` for cart functionality
- [x] 3.2 Display product images, descriptions, prices
- [x] 3.3 Add quantity increment/decrement controls
- [x] 3.4 Show line item totals with quantity
- [x] 3.5 Calculate subtotal, tax, and grand total
- [x] 3.6 "Proceed to Checkout" button initiates Stripe checkout

## Phase 4: Backend - Stripe Integration ✅ COMPLETED
- [x] 4.1 Add `createProductCheckoutSession()` to stripe.js service
- [x] 4.2 Support one-time payments (not subscriptions)
- [x] 4.3 Add line items with quantity to checkout session
- [x] 4.4 Include product metadata for webhook processing
- [x] 4.5 Add helper functions: `getCheckoutSession()`, `getOrCreateProductCustomer()`

## Phase 5: Frontend - Checkout ✅ COMPLETED
- [x] 5.1 Create `src/routes/checkout.js` for checkout API
- [x] 5.2 Create checkout success page (`public/pages/checkout-success.html`)
- [x] 5.3 Redirect to Stripe hosted checkout page
- [x] 5.4 Handle success/cancel URLs

## Phase 6: Server Routes Mount ✅ COMPLETED
- [x] 6.1 Mount cart routes in server.js
- [x] 6.2 Mount checkout routes in server.js
- [x] 6.3 Test auth middleware on cart/checkout endpoints

## Phase 7: Testing (IN PROGRESS)
- [ ] 7.1 Test adding products with various quantities
- [ ] 7.2 Test updating quantities in cart
- [ ] 7.3 Test removing products from cart
- [ ] 7.4 Test Stripe checkout flow
- [ ] 7.5 Test webhook handling for successful payments

## Next Steps
- Add webhook endpoint for Stripe checkout completion
- Add order history page to track purchases
- Add email confirmation on successful purchase
- Implement inventory management for products

