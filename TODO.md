# Fix Failing Middleware Tests

## Tasks
- [ ] Fix JWT payload in middleware.test.js to use `{ id: user._id }` instead of `{ userId: user._id }`
- [ ] Fix password in input sanitization test to meet strength requirements
- [ ] Add OPTIONS handler in server.js for `/api/v1/auth` routes to handle CORS preflight
- [ ] Run tests to verify fixes
