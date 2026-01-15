# JEFitness Test Suite Documentation

## Overview

This project includes a comprehensive test suite using Jest for both backend (Node.js) and frontend (vanilla JavaScript) code. The tests are organized into unit tests, integration tests, and usage/load tests.

## Test Structure

```
jefitness/
├── src/tests/
│   ├── setup.js                          # Backend test setup (MongoDB in-memory)
│   ├── unit/
│   │   ├── routes/
│   │   │   └── users.test.js             # User routes unit tests
│   │   ├── services/
│   │   │   └── stripe.test.js            # Stripe service unit tests
│   │   └── models/
│   │       └── User.test.js              # User model unit tests (add as needed)
│   ├── integration/
│   │   └── api.test.js                   # Full API integration tests
│   └── usage/
│       └── concurrent-subscriptions.test.js  # Load & concurrency tests
│
└── public/tests/
    ├── setup-jsdom.js                    # Frontend test setup (jsdom)
    └── unit/
        └── products.test.js              # Products.js frontend tests
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test Suites
```bash
# Backend unit tests only
npm run test:unit

# Frontend tests only
npm run test:frontend

# Integration tests only
npm run test:integration

# Usage/load tests only
npm run test:usage
```

### Watch Mode (Re-run on file changes)
```bash
npm run test:watch
```

### Verbose Output
```bash
npm run test:verbose
```

## Test Categories

### 1. Unit Tests

**Backend Unit Tests** (`src/tests/unit/`)
- Test individual functions, classes, and modules in isolation
- Mock external dependencies (Stripe, database, etc.)
- Fast execution
- High code coverage

**Examples:**
- `src/tests/unit/routes/users.test.js` - Tests all user route endpoints
- `src/tests/unit/services/stripe.test.js` - Tests Stripe integration with mocked API

**Frontend Unit Tests** (`public/tests/unit/`)
- Test individual frontend modules and functions
- Mock browser APIs (localStorage, fetch, Bootstrap)
- Run in jsdom environment

**Examples:**
- `public/tests/unit/products.test.js` - Tests cart management and checkout

### 2. Integration Tests

**Location:** `src/tests/integration/`

Integration tests verify that different parts of the application work together correctly:
- Full request-response cycles
- Database interactions
- Authentication flows
- Multiple service interactions

**Example Test Scenarios:**
```javascript
// Complete registration → login → profile access flow
it('should complete full registration and login flow', async () => {
  // Register → Login → Access protected route
});

// User CRUD operations with database
it('should allow user to update own profile', async () => {
  // PUT request → Database update → Verification
});
```

### 3. Usage/Load Tests

**Location:** `src/tests/usage/`

Simulate real-world usage patterns and test system behavior under load:
- Concurrent API requests
- Race conditions
- Performance benchmarks
- Data consistency under load

**Example Test Scenarios:**
```javascript
// 10 simultaneous subscription creations
it('should handle 10 simultaneous subscription requests', async () => {
  // Create 10 users → Create subscriptions concurrently → Verify consistency
});

// Performance testing
it('should maintain performance with large dataset', async () => {
  // Create 50 users → Query performance → Assert query speed
});
```

## Test Configuration

### Jest Configuration (`jest.config.js`)

The project uses a multi-project Jest configuration:

```javascript
{
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
      testMatch: ['<rootDir>/src/tests/**/*.test.js'],
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/public/tests/setup-jsdom.js'],
      testMatch: ['<rootDir>/public/tests/**/*.test.js'],
    }
  ]
}
```

### Coverage Thresholds

Minimum coverage requirements:
- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

### Environment Setup

**Backend Tests:**
- Uses `mongodb-memory-server` for in-memory database
- Mocks Stripe API to prevent real charges
- Sets test environment variables automatically

**Frontend Tests:**
- Uses `jsdom` for DOM simulation
- Mocks browser APIs (localStorage, fetch, Bootstrap)
- Provides window.ApiConfig for API base URL

## Writing New Tests

### Backend Unit Test Template

```javascript
const User = require('../../../models/User');

describe('User Model Tests', () => {
  it('should create user with valid data', async () => {
    const user = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'hashedPassword123',
    });

    expect(user._id).toBeDefined();
    expect(user.email).toBe('john@example.com');
  });

  it('should reject invalid email format', async () => {
    await expect(
      User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'password123',
      })
    ).rejects.toThrow();
  });
});
```

### Frontend Unit Test Template

```javascript
require('../../js/myModule.js');

describe('MyModule Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch.mockClear();
  });

  it('should save data to localStorage', () => {
    window.myModule.saveData('key', 'value');
    
    expect(localStorage.setItem).toHaveBeenCalledWith('key', 'value');
  });
});
```

### Integration Test Template

```javascript
const request = require('supertest');
const app = require('../../server'); // Your Express app

describe('API Integration Tests', () => {
  it('should complete user registration flow', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'Password123!',
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeDefined();
  });
});
```

## Mocking Strategies

### Mocking Stripe

```javascript
jest.mock('stripe', () => {
  return jest.fn(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      retrieve: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
    },
  }));
});
```

### Mocking Fetch

```javascript
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ success: true, data: {} }),
});
```

### Mocking localStorage

```javascript
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
global.localStorage = localStorageMock;
```

## Best Practices

### 1. Test Naming
- Use descriptive test names that explain what is being tested
- Format: `should [expected behavior] when [condition]`

```javascript
it('should return 404 when user does not exist', async () => {
  // Test implementation
});
```

### 2. Setup and Teardown
- Use `beforeEach` for test-specific setup
- Use `afterEach` for cleanup
- Use `beforeAll`/`afterAll` for expensive operations

### 3. Assertions
- Test one thing per test case
- Use specific assertions (`toBe`, `toEqual`, `toContain`)
- Include both positive and negative test cases

### 4. Mocking
- Mock external dependencies (APIs, databases, file systems)
- Reset mocks between tests
- Use realistic mock data

### 5. Async Testing
- Use `async/await` for clarity
- Set appropriate timeouts for slow operations
- Handle promise rejections properly

## Coverage Reports

After running `npm run test:coverage`, coverage reports are generated in:
- `coverage/` - HTML coverage report (open `index.html` in browser)
- Console output shows summary

### Viewing Coverage

```bash
# Generate and view coverage
npm run test:coverage

# Open HTML report (Windows)
start coverage/index.html

# Open HTML report (Mac/Linux)
open coverage/index.html
```

## Continuous Integration

Tests run automatically in CI/CD pipelines. Ensure:
- All tests pass before merging
- Coverage thresholds are met
- No console errors or warnings

## Troubleshooting

### Common Issues

**Issue: MongoDB connection timeout**
```
Solution: Increase Jest timeout in jest.config.js
testTimeout: 60000
```

**Issue: Frontend tests fail to find modules**
```
Solution: Check that paths in require() are correct relative to test file
```

**Issue: Stripe mock not working**
```
Solution: Ensure jest.mock() is called before requiring the module
```

**Issue: Tests pass locally but fail in CI**
```
Solution: Check environment variables and ensure test database is properly configured
```

## Contributing

When adding new features:
1. Write tests before or alongside implementation
2. Ensure all existing tests pass
3. Add integration tests for new API endpoints
4. Update this README with new test categories if needed

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [jsdom Documentation](https://github.com/jsdom/jsdom)