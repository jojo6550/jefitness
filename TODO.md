# TODO: Fix Failing Unit Tests in JEFitness Project

## Completed Tasks
- [x] Fix auth middleware to handle Bearer tokens with extra spaces (added .trim())
- [x] Fix expired token test to use already expired token (expiresIn: '-1s')
- [x] Fix cart route PUT /api/cart/update/:itemId to use { userId: req.user.id } instead of { user: req.user.id }
- [x] Fix orders route to use { userId: req.user.id } in cart lookup and order queries
- [x] Fix auth test Nutrition Logs beforeEach to use valid password 'Test123!@#' instead of 'hashedpassword'

## Test Results
- All unit tests now passing (47 passed, 47 total)
- No more failing tests in middleware/auth.test.js, routes/cart.test.js, or routes/auth.test.js
