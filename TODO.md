# Test Fixes TODO

## Frontend Tests
- [ ] Fix localStorage mocking in Jest setup (public/tests/setup-jsdom.js)

## Cache Service Tests
- [ ] Export CacheService class instead of instance (src/services/cache.js)

## Server.js Syntax Error
- [ ] Fix undefined `req` reference in middleware setup (src/server.js)

## Auth Middleware Tests
- [ ] Update auth middleware error messages to match test expectations (src/middleware/auth.js)

---

# Code Quality Fixes TODO

## 1. Inconsistent Error Handling
**Problem:** Mix of apiError, custom error classes, and direct res.status().json() calls

**Solution:** Standardize on using custom error classes from errorHandler.js

**Files to update:**
- [ ] src/routes/auth.js - Replace apiError() calls with error classes
- [ ] src/routes/users.js - Replace direct res.status().json() with error classes
- [ ] src/routes/workouts.js - Replace direct res.status().json() with error classes
- [ ] src/routes/subscriptions.js - Replace direct res.status().json() with error classes
- [ ] src/routes/trainer.js - Replace direct res.status().json() with error classes
- [ ] src/routes/programs.js - Replace direct res.status().json() with error classes
- [ ] src/routes/products.js - Replace direct res.status().json() with error classes
- [ ] src/routes/appointments.js - Replace direct res.status().json() with error classes
- [ ] src/utils/apiError.js - Mark as deprecated (or remove if not used)

**Standard error response format:**
```
json
{
  "error": {
    "message": "Error message",
    "status": 400,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "..."
  }
}
```

## 2. Duplicate Fields in User Model
**Problem:** Multiple duplicate fields representing the same data

**Solution:** Consolidate to single fields

**Files to update:**
- [ ] src/models/User.js
  - Remove `dateOfBirth` field (keep `dob` which has validation)
  - Decide on `lastLoggedIn` vs `lastLogin` - pick one and remove the other
  - Decide on `passwordResetToken` vs `resetPasswordToken` - pick one and remove the other
- [ ] src/routes/users.js - Update to use consolidated field names
- [ ] src/routes/auth.js - Update to use consolidated field names
- [ ] src/middleware/inputValidator.js - Update field names if needed

**Fields to keep (after consolidation):**
- `dob` (remove `dateOfBirth`)
- `lastLoggedIn` OR `lastLogin` (pick one)
- `passwordResetToken` OR `resetPasswordToken` (pick one)

## 3. Inconsistent Naming Conventions
**Problem:** Mixed camelCase and snake_case in responses

**Solution:** Standardize on camelCase for all response fields

**Files to check:**
- [ ] All route files - Ensure response fields use camelCase
- [ ] src/models/*.js - Ensure schema fields use camelCase

## 4. Response Format Standardization
**Problem:** Different response formats across routes

**Solution:** Standardize all error responses to use the errorHandler middleware format

**Standard success response format:**
```
json
{
  "success": true,
  "data": { ... }
}
```

**Standard error response format:**
```
json
{
  "error": {
    "message": "Error message",
    "status": 400
  }
}
