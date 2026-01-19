# JE Fitness - Backend Test Suite

Comprehensive Jest test suite for JE Fitness platform backend API.

## Overview

This test suite provides full coverage for:
- Authentication & Authorization
- Subscription Management (Stripe)
- Product Sales & E-commerce
- Appointment Booking System
- Medical Document Management
- GDPR Compliance & Data Protection
- System Security
- Caching & Performance
- Monitoring & Notifications
- Program Marketplace

## Test Structure

```
src/tests/
├── setup.js                          # Global test setup
├── integration/                      # Integration tests
│   ├── auth.test.js                 # Authentication & authorization
│   ├── subscriptions.test.js        # Stripe subscription management
│   ├── products.test.js             # Product sales & e-commerce
│   ├── appointments.test.js         # Appointment booking
│   ├── medical-documents.test.js    # Medical document handling
│   ├── gdpr.test.js                 # GDPR compliance
│   ├── security.test.js             # Security features
│   ├── programs.test.js             # Program marketplace
│   └── monitoring.test.js           # Monitoring & notifications
└── unit/                            # Unit tests
    ├── services/
    │   └── cache.test.js            # Cache service
    └── middleware/
        └── auth.test.js             # Auth middleware
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- auth.test.js

# Run integration tests only
npm run test:integration

# Run unit tests only
npm run test:unit

# Watch mode
npm run test:watch

# Verbose output
npm run test:verbose
```

## Test Coverage Goals

- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

Current coverage meets or exceeds these thresholds across all test suites.

## Key Features

### Mocking Strategy

- **Stripe**: All Stripe API calls are mocked
- **Email (Mailjet)**: Email sending is mocked
- **Redis/Cache**: In-memory cache service used
- **File Storage**: Temporary file system used
- **Time/Date**: System time can be mocked for TTL tests

### Test Database

- Uses MongoDB Memory Server for isolated, fast testing
- Database is reset between test runs
- No connection to production or development databases required

### Security Testing

- NoSQL injection prevention
- XSS attack prevention
- CSRF protection
- IDOR (Insecure Direct Object Reference) prevention
- Rate limiting enforcement
- JWT token security

### GDPR Compliance Testing

- Consent management (grant/withdraw)
- Data subject rights (access, rectification, erasure, portability)
- Audit trail verification
- PII masking in logs

## Test Guidelines

### Arrange-Act-Assert Pattern

All tests follow the AAA pattern:

```javascript
test('should perform action', async () => {
  // Arrange - Set up test data
  const user = await User.create({ ... });
  const token = jwt.sign({ ... });
  
  // Act - Execute the test
  const response = await request(app)
    .get('/api/endpoint')
    .set('Authorization', `Bearer ${token}`);
  
  // Assert - Verify results
  expect(response.status).toBe(200);
  expect(response.body.data).toBeDefined();
});
```

### No Production Code Modifications

Tests do NOT modify production code or add new features. They only test existing functionality.

### No Business Logic Mocking

Business logic is NOT mocked - only external services (Stripe, email, etc.) are mocked to ensure tests run in isolation.

### Test Isolation

- Each test is independent
- Database is cleared between tests
- No shared state between tests
- Tests can run in any order

## Coverage by Feature

### ✅ Authentication & Authorization
- User registration (success/failure)
- Login validation
- JWT generation and expiration
- Protected route access
- Role-based authorization (admin, trainer, client)
- Token tampering prevention
- Account lockout after failed attempts

### ✅ Subscription Management
- Checkout session creation
- Webhook event handling
- Subscription status updates
- Access control by subscription status
- Idempotency protection

### ✅ Product Sales
- Product listing
- Checkout flow
- Order creation
- Purchase history (IDOR protected)
- Cart validation

### ✅ Appointments
- Appointment creation
- Time-slot conflict detection
- Role restrictions
- Cancellation/rescheduling
- Past date rejection

### ✅ Medical Documents
- Secure upload
- File type/size validation
- Authorization checks
- Cross-user access prevention
- Soft deletion

### ✅ GDPR Compliance
- Consent recording
- Data export
- Right-to-erasure
- PII masking
- Audit trail

### ✅ System Security
- Security headers (CSP, HSTS, etc.)
- Rate limiting
- NoSQL injection prevention
- XSS prevention
- IDOR prevention
- Input validation

### ✅ Program Marketplace
- Program listing
- Purchase flow
- Ownership enforcement
- Duplicate purchase prevention

## Troubleshooting

### Tests Failing

1. Ensure MongoDB Memory Server can start
2. Check Node.js version (v20 recommended)
3. Verify all dependencies installed: `npm install`
4. Clear jest cache: `npx jest --clearCache`

### Timeout Errors

- Default timeout is 30 seconds per test
- Increase if needed in jest.config.js
- Check for unresolved promises

### Database Errors

- Ensure no other tests are running simultaneously
- MongoDB Memory Server creates isolated instances
- Check that afterAll hooks are cleaning up properly

## Contributing

When adding new tests:

1. Follow existing patterns
2. Use descriptive test names
3. Include both positive and negative test cases
4. Add edge case coverage
5. Mock external dependencies
6. Ensure tests are isolated and idempotent

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Testing Best Practices](https://testingjavascript.com/)

## License

ISC
