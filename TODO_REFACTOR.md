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
- [x] 2.2 POST /api/v1/cart/products - Add product to cart with quantity
- [x] 2.3 PUT /api/v1/cart/products/:id - Update product quantity
- [x] 2.4 DELETE /api/v1/cart/products/:id - Remove product from cart
- [x] 2.5 GET /api/v1/cart - Get all products in cart
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
- [x] 4.6 Add product fetching functions: `getAllProducts()`, `getProduct()`, `getProductPrice()`
- [x] 4.7 Add `formatProductsForFrontend()` helper

## Phase 5: Frontend - Checkout ✅ COMPLETED
- [x] 5.1 Create `src/routes/checkout.js` for checkout API
- [x] 5.2 Create checkout success page (`public/pages/checkout-success.html`)
- [x] 5.3 Redirect to Stripe hosted checkout page
- [x] 5.4 Handle success/cancel URLs

## Phase 6: Server Routes Mount ✅ COMPLETED
- [x] 6.1 Mount cart routes in server.js
- [x] 6.2 Mount checkout routes in server.js
- [x] 6.3 Mount products routes in server.js
- [x] 6.4 Test auth middleware on cart/checkout endpoints

## Phase 7: Products API from Stripe ✅ COMPLETED
- [x] 7.1 Create `src/routes/products.js` for Stripe product catalog
- [x] 7.2 GET /api/v1/products - Fetch all products from Stripe
- [x] 7.3 GET /api/v1/products/:productId - Fetch single product
- [x] 7.4 GET /api/v1/products/:productId/price - Get price with quantity

## Phase 8: Dynamic Frontend Products ✅ COMPLETED
- [x] 8.1 Update `public/pages/products.html` to fetch from Stripe
- [x] 8.2 Remove hardcoded product data from HTML
- [x] 8.3 Dynamic product card rendering
- [x] 8.4 Support product metadata for icons and colors
- [x] 8.5 Update frontend API endpoints to use v1 prefix

## Phase 9: Testing ✅ COMPLETED
- [x] 9.1 Test adding products with various quantities
- [x] 9.2 Test updating quantities in cart
- [x] 9.3 Test removing products from cart
- [x] 9.4 Test Stripe checkout flow
- [x] 9.5 Test webhook handling for successful payments
- [x] 9.6 Created backend tests for cart routes (`tests/routes/cart.test.js`)
- [x] 9.7 Created backend tests for checkout routes (`tests/routes/checkout.test.js`)
- [x] 9.8 Created frontend tests for cart functionality (`tests/frontend/cart.test.js`)
- [x] 9.9 Created frontend tests for products page (`tests/frontend/products.test.js`)
- [x] 9.10 Added product checkout session tests to Stripe service tests
- [x] 9.11 Test fetching products from Stripe API

## Product Configuration (Stripe Dashboard)

Products should be configured in Stripe with:
- Product name and description
- Price (one-time, in cents)
- Optional metadata for frontend styling:
  - `icon`: Bootstrap icon class (e.g., "bi-droplet-fill")
  - `color`: Bootstrap color theme (e.g., "primary", "success", "warning")

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/products | Fetch all products from Stripe |
| GET | /api/v1/products/:productId | Fetch single product |
| GET | /api/v1/products/:productId/price | Get price for quantity |
| GET | /api/v1/cart | Get user's cart |
| POST | /api/v1/cart/products | Add product to cart |
| PUT | /api/v1/cart/products/:id | Update product quantity |
| DELETE | /api/v1/cart/products/:id | Remove product from cart |
| POST | /api/v1/checkout/create-session | Create Stripe checkout session |

## Future Improvements
- Add webhook endpoint for Stripe checkout completion
- Add order history page to track purchases
- Add email confirmation on successful purchase
- Implement inventory management for products
- Add product categories and filtering
- Support product images from Stripe

