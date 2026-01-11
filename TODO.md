# TODO: Implement Stripe Subscription Backend API

## Tasks
- [x] Create src/services/stripe.js: Initialize Stripe client and define functions for customer creation, subscription creation, and retrieval
- [x] Create src/routes/subscriptions.js: Implement POST /api/subscriptions/create and GET /api/subscriptions/:customerId endpoints with validation and error handling
- [x] Update src/server.js: Add subscriptions route mounting under /api/v1/subscriptions
- [x] Create tests/routes/subscriptions.test.js: Unit tests for creating subscriptions, error handling, and fetching subscriptions using Jest with mocked Stripe
- [ ] Ensure STRIPE_SECRET_KEY is set in .env
- [ ] Run unit tests to verify functionality
