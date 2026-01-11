# JE Fitness Platform - Test Suite Documentation

## Overview

This directory contains comprehensive unit, integration, and end-to-end tests for the JE Fitness platform. The test suite is built using Jest and Supertest, with MongoDB Memory Server for isolated database testing.

## Test Structure

```
tests/
├── setup.js                      # Global test configuration
├── models/                       # Model validation tests
│   └── User.test.js
├── middleware/                   # Middleware tests
│   ├── auth.test.js
│   ├── dbConnection.test.js
│   ├── errorHandler.test.js
│   └── versioning.test.js
├── routes/                       # API route tests
│   ├── appointments.test.js
│   ├── auth.test.js
│   ├── chat.test.js
│   ├── medical-documents.test.js
│   ├── subscriptions.test.js
│   └── trainer.test.js
├── services/                     # Service tests
│   └── logger.test.js
└── utils/                        # Utility tests
    └── cacheVersion.test.js
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- tests/models/User.test.js
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Only Integration Tests
```bash
npm test -- tests/integration
```

## Test Coverage Areas

### 1. Model Tests (`tests/models/`)

#### User Model (`User.test.js`)
- ✅ Schema validation (required fields, email format, password strength)
- ✅ Email uniqueness constraint
- ✅ Phone number validation
- ✅ Date of birth validation
- ✅ Gender enum validation
- ✅ Nutrition logs functionality
- ✅ Sleep logs functionality
- ✅ Schedule management
- ✅ Security fields (lockout, verification tokens)
- ✅ Edge cases (special characters, whitespace, maximum values)

### 2. Middleware Tests (`tests/middleware/`)

#### Auth Middleware (`auth.test.js`)
- ✅ Bearer token validation
- ✅ x-auth-token fallback
- ✅ Missing token rejection
- ✅ Invalid token rejection
- ✅ Expired token handling
- ✅ Wrong secret detection
- ✅ Token format variations
- ✅ User data extraction
- ✅ Edge cases (missing JWT_SECRET, null values)

### 3. Route Tests (`tests/routes/`)

#### Auth Routes (`auth.test.js`)
- ✅ User signup (validation, duplicate check, OTP generation)
- ✅ Email verification
- ✅ User login (credentials, lockout, failed attempts)
- ✅ Password reset flow
- ✅ Profile retrieval and updates

#### Appointments Routes (`appointments.test.js`)
- ✅ Appointment creation and management
- ✅ Scheduling validation
- ✅ Authorization checks

#### Chat Routes (`chat.test.js`)
- ✅ Message sending and retrieval
- ✅ Real-time communication tests

#### Subscriptions Routes (`subscriptions.test.js`)
- ✅ Subscription management
- ✅ Payment integration tests

#### Medical Documents Routes (`medical-documents.test.js`)
- ✅ Document upload and retrieval
- ✅ Authorization and privacy checks

#### Trainer Routes (`trainer.test.js`)
- ✅ Trainer-specific functionality
- ✅ Role-based access control

### 4. Service Tests (`tests/services/`)

#### Logger Service (`logger.test.js`)
- ✅ Logging functionality
- ✅ Log levels and formatting
- ✅ Error tracking

## Test Configuration

### Environment Variables
The test suite automatically sets up the following environment variables:
- `JWT_SECRET`: Test JWT secret key
- `MAILJET_API_KEY`: Mocked Mailjet API key
- `MAILJET_SECRET_KEY`: Mocked Mailjet secret
- `FRONTEND_URL`: Test frontend URL
- `CLEANUP_TIME`: Account cleanup interval
- `CRON_SCHEDULE`: Cron job schedule

### Database
- Uses MongoDB Memory Server for isolated testing
- Database is created fresh for each test suite
- All collections are cleared after each test
- Automatic cleanup after all tests complete

### Mocking
- Mailjet email service is mocked to prevent actual email sending
- Console logs are suppressed during test execution
- All external dependencies are properly mocked

## Coverage Goals

Current coverage targets:
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

View detailed coverage report:
```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

## Writing New Tests

### Best Practices

1. **Descriptive Test Names**: Use clear, descriptive names that explain what is being tested
```javascript
test('should reject signup with missing required fields', async () => {
  // Test implementation
});
```

2. **Arrange-Act-Assert Pattern**: Structure tests clearly
```javascript
test('should add item to cart', async () => {
  // Arrange: Set up test data
  const user = await User.create({...});
  
  // Act: Perform action
  const response = await request(app)
    .post('/api/cart/add')
    .send({...});
  
  // Assert: Verify results
  expect(response.body.items).toHaveLength(1);
});
```

3. **Test Isolation**: Each test should be independent
4. **Edge Cases**: Always include edge case testing
5. **Error Scenarios**: Test both success and failure paths

### Adding New Tests

1. Create test file in appropriate directory
2. Import necessary dependencies
3. Set up beforeEach/afterEach hooks for cleanup
4. Write test cases following existing patterns
5. Run tests to verify

Example:
```javascript
const Model = require('../../src/models/Model');

describe('Model Name', () => {
  beforeEach(async () => {
    // Setup code
  });

  describe('Feature Group', () => {
    test('should do something', async () => {
      // Test implementation
    });
  });
});
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 30 seconds for full suite)
- No external dependencies
- Consistent results across environments
- Detailed error reporting

## Troubleshooting

### Common Issues

1. **Tests Timeout**
   - Increase timeout in jest.config.js
   - Check for unclosed database connections

2. **Port Already in Use**
   - The test suite uses in-memory database, no port conflicts

3. **Random Test Failures**
   - Ensure proper cleanup in afterEach hooks
   - Check for test interdependencies

4. **Coverage Not Generated**
   - Ensure jest and coverage dependencies are installed
   - Check jest.config.js settings

## Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure all tests pass before committing
3. Maintain or improve coverage percentage
4. Update this README if adding new test categories

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)