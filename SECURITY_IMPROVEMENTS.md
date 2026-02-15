# Security Improvements

This document describes recent security improvements made to the JE Fitness application.

## Issue 1: In-Memory Webhook Event Cache (Not Scalable)

### Problem
The webhook event processing cache was stored in-memory using a JavaScript `Set`, which caused two critical issues:
- **Loss of data on restart**: All processed webhook IDs were lost when the server restarted, allowing replay attacks
- **Not distributed**: In a multi-instance deployment, each server had its own cache, risking duplicate processing

### Solution
Replaced in-memory cache with MongoDB-backed persistence:

1. **New Model**: `src/models/WebhookEvent.js`
   - Stores processed webhook events in MongoDB
   - Uses TTL (Time-To-Live) index for automatic cleanup after 24 hours
   - Prevents memory leaks without manual cleanup

2. **Updated Middleware**: `src/middleware/auth.js`
   - `isWebhookEventProcessed()` → Now async, queries MongoDB
   - `markWebhookEventProcessed()` → Now async, saves to MongoDB with TTL
   - Graceful error handling if database is unavailable

3. **Updated Routes**: `src/routes/webhooks.js`
   - Webhook handler now awaits async functions for replay protection
   - Passes event type for better logging and debugging

### Benefits
✅ Survives server restarts  
✅ Works across multiple server instances  
✅ No manual cleanup needed (automatic TTL cleanup)  
✅ Better for horizontal scaling  
✅ Prevents replay attacks in distributed systems  

### Migration Steps
```bash
# The WebhookEvent collection will be automatically created on first use
# No manual migration needed
```

### Monitoring
Check for processed webhook events:
```javascript
const WebhookEvent = require('./models/WebhookEvent');
const recent = await WebhookEvent.find({}).sort({ processedAt: -1 }).limit(100);
console.log(recent);
```

---

## Issue 2: Encryption Key Handling

### Problem
Sensitive fields (phone, DOB, medical conditions, etc.) were encrypted using `mongoose-encryption`, but the encryption key handling had issues:
- No validation of encryption key strength
- No warning if encryption was disabled
- No centralized configuration
- Hardcoded field lists scattered in the User model

### Solution
Created centralized encryption configuration utility:

1. **New Utility**: `src/utils/encryptionConfig.js`
   - Validates ENCRYPTION_KEY and SIGNING_KEY from environment
   - Enforces minimum key length (32 characters)
   - Centralizes encrypted field definitions
   - Provides helper functions for checking encryption status
   - Graceful degradation if encryption is not configured

2. **Updated User Model**: `src/models/User.js`
   - Uses encryption configuration utility instead of direct env access
   - Better error handling if encryption fails
   - Continues startup even if encryption initialization fails (safe degradation)

### Configuration

#### For Production (Encryption Enabled)
```bash
# .env
ENCRYPTION_KEY=your-very-long-secret-key-at-least-32-characters-long
SIGNING_KEY=another-very-long-secret-key-at-least-32-characters-long
```

#### For Development (Optional)
```bash
# If not set, encryption is disabled
# A warning will be logged:
# ⚠️ WARNING: ENCRYPTION_KEY not set. Sensitive fields will NOT be encrypted.
```

### Encrypted Fields
The following fields are encrypted when `ENCRYPTION_KEY` is configured:
- `medicalConditions` - Medical history and conditions
- `goals` - Fitness goals and objectives
- `reason` - Reason for joining
- `phone` - Phone number
- `dob` - Date of birth
- `gender` - Gender information
- `startWeight` - Initial weight data
- `currentWeight` - Current weight tracking
- `workoutLogs` - Complete workout history

### Non-Encrypted Fields (Queryable)
These fields are intentionally NOT encrypted for querying and authentication:
- `password` - Uses bcrypt hashing (more secure than encryption)
- `email` - Required for unique constraint and queries
- `firstName`, `lastName` - User identification
- `role` - Permission checks
- `stripeCustomerId` - Payment integration

### Benefits
✅ Centralized encryption configuration  
✅ Validates key strength at startup  
✅ Clear warnings if encryption is disabled  
✅ Graceful error handling  
✅ Easier key rotation in the future  
✅ Better documentation of encrypted vs queryable fields  

### Key Rotation Strategy (Future Implementation)
When rotating encryption keys:
1. Deploy with both old and new keys
2. Create a migration script to re-encrypt all documents
3. Remove old key from configuration
4. Deploy updated configuration

Example migration outline:
```javascript
// scripts/rotate-encryption-key.js
const User = require('../models/User');
const oldKey = process.env.OLD_ENCRYPTION_KEY;
const newKey = process.env.ENCRYPTION_KEY;

// 1. Save decrypted data (mongoose-encryption handles this)
// 2. Remove encryption plugin temporarily
// 3. Update documents
// 4. Re-apply encryption with new key
```

---

## Testing

### Webhook Event Processing Tests
Updated `src/tests/unit/middleware/auth.test.js`:
- All webhook tests now use async/await
- Tests verify database interaction
- Error handling tests for database failures

Run tests:
```bash
npm test -- auth.test.js
```

### Encryption Configuration Tests
Add test file `src/tests/unit/utils/encryptionConfig.test.js`:
```javascript
const { validateEncryptionKey, getEncryptionConfig, isEncryptionEnabled } = require('../../../utils/encryptionConfig');

describe('Encryption Configuration', () => {
  test('should validate encryption key', () => {
    const config = validateEncryptionKey();
    expect(config).toBeDefined();
  });
});
```

---

## Environment Variables Checklist

### Required for Production Security
- [ ] `ENCRYPTION_KEY` - Set to a strong 32+ character string
- [ ] `SIGNING_KEY` - Set to a strong 32+ character string (optional, falls back to ENCRYPTION_KEY)
- [ ] `STRIPE_WEBHOOK_SECRET` - For webhook signature verification

### Optional but Recommended
- [ ] Store keys in AWS Secrets Manager or similar service
- [ ] Rotate keys every 90 days
- [ ] Log key rotation events for audit trail

---

## Security Audit Checklist

- [x] Webhook events persisted to database with TTL
- [x] Replay attack prevention across multiple instances
- [x] Encryption key validation at startup
- [x] Clear warnings when encryption is disabled
- [x] Graceful error handling for encryption failures
- [x] Encrypted fields properly configured
- [x] Non-encrypted fields remain queryable
- [ ] Key rotation procedure documented (future)
- [ ] Encryption key backup strategy (future)
- [ ] Automated key rotation (future)

---

## Related Issues
- Issue: In-memory webhook event cache (not scalable) ✅ FIXED
- Issue: Encryption key handling could be improved ✅ IMPROVED

---

## References
- mongoose-encryption: https://github.com/joegoldbeck/mongoose-encryption
- Stripe Webhook Security: https://stripe.com/docs/webhooks/signatures
- OWASP Encryption: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
