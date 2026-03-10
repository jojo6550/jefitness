# JE Fitness Implementation Guide - Quick Start

This guide provides step-by-step instructions to implement the most critical recommendations from the code review.

---

## Phase 1: Security Hardening (Priority: CRITICAL)

### Task 1.1: Add Rate Limiting to All Endpoints

**File: `src/middleware/rateLimiter.js` (Update)**

```javascript
const rateLimit = require('express-rate-limit');

const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || 'Too many requests',
    standardHeaders: true, // Return RateLimit-* headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => process.env.NODE_ENV === 'development' && req.query.bypass === 'true',
    keyGenerator: (req) => options.keyFn ? options.keyFn(req) : req.ip
  });
};

// Specific limiters
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later'
});

const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset requests'
});

const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'API rate limit exceeded'
});

const fileLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many file uploads'
});

const appointmentLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Appointment booking limit reached'
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  fileLimiter,
  appointmentLimiter,
  createLimiter
};
```

**File: `src/server.js` (Update middleware application)**

```javascript
// Add around line 160-170, after CORS middleware
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/api/', apiLimiter);
```

**Update routes to use specific limiters:**

```javascript
// src/routes/medical-documents.js
const { fileLimiter } = require('../middleware/rateLimiter');
router.post('/upload', auth, fileLimiter, uploadHandler);

// src/routes/appointments.js
const { appointmentLimiter } = require('../middleware/rateLimiter');
router.post('/', auth, appointmentLimiter, bookAppointmentHandler);
```

**Estimated Time:** 30 minutes  
**Test Command:** `npm test -- rateLimiter.test.js`

---

### Task 1.2: Add CSRF Protection

**File: `src/middleware/csrf.js` (Create new)**

```javascript
const crypto = require('crypto');

class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.tokenTTL = 60 * 60 * 1000; // 1 hour
    this.cleanupInterval = 60 * 60 * 1000; // Clean every hour
    this.startCleanup();
  }

  generateToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    
    this.tokens.set(token, {
      userId: req.user?.id || 'anon',
      createdAt: Date.now(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    return token;
  }

  verifyToken(req) {
    const token = req.body?._csrf || req.headers['x-csrf-token'];

    if (!token) {
      return { valid: false, error: 'CSRF token missing' };
    }

    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return { valid: false, error: 'Invalid CSRF token' };
    }

    // Check token age
    if (Date.now() - tokenData.createdAt > this.tokenTTL) {
      this.tokens.delete(token);
      return { valid: false, error: 'CSRF token expired' };
    }

    // Optional: Verify same user agent and IP
    if (tokenData.userAgent !== req.get('User-Agent')) {
      return { valid: false, error: 'Token mismatch' };
    }

    // Token is valid, delete it (single use)
    this.tokens.delete(token);

    return { valid: true };
  }

  middleware() {
    return (req, res, next) => {
      // Generate token for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const token = this.generateToken(req);
        res.locals.csrfToken = token;
        res.set('X-CSRF-Token', token);
        return next();
      }

      // Verify token for state-changing methods
      const verification = this.verifyToken(req);

      if (!verification.valid) {
        return res.status(403).json({
          success: false,
          error: verification.error
        });
      }

      next();
    };
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      let cleaned = 0;
      const now = Date.now();

      for (const [token, data] of this.tokens) {
        if (now - data.createdAt > this.tokenTTL) {
          this.tokens.delete(token);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[CSRF] Cleaned ${cleaned} expired tokens`);
      }
    }, this.cleanupInterval);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = new CSRFProtection();
```

**File: `src/server.js` (Apply middleware)**

```javascript
// Around line 130, after sanitizeInput
const csrfProtection = require('./middleware/csrf');
app.use(csrfProtection.middleware());

// Cleanup on shutdown
process.on('SIGTERM', () => {
  csrfProtection.stop();
  // ... other cleanup
});
```

**File: Update HTML forms in `public/pages/*.html`**

```html
<!-- Add hidden field for CSRF token -->
<form id="login-form" method="POST">
  <input type="hidden" name="_csrf" id="csrfToken" value="">
  <!-- ... form fields -->
  <button type="submit">Login</button>
</form>

<script>
// Populate CSRF token
document.addEventListener('DOMContentLoaded', async () => {
  // Get CSRF token from a safe endpoint (GET request)
  const response = await fetch('/api/v1/csrf-token');
  const data = await response.json();
  document.getElementById('csrfToken').value = data.token;
});
</script>
```

**Add CSRF token endpoint:**

```javascript
// src/routes/public.js
router.get('/csrf-token', (req, res) => {
  // Token is already set in res.locals by middleware
  res.json({ token: res.locals.csrfToken });
});
```

**Estimated Time:** 1 hour  
**Test Command:** `npm test -- csrf.test.js`

---

## Phase 2: Performance & Scalability

### Task 2.1: Set Up Redis Cache with Memory Fallback

**Install Redis:**
```bash
npm install redis
```

**File: `src/services/cache.js` (Replace)**

```javascript
const redis = require('redis');

class CacheService {
  constructor() {
    this.redisClient = null;
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();
    this.isRedisAvailable = false;
  }

  async connect() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({ url: process.env.REDIS_URL });
        
        this.redisClient.on('error', (err) => {
          console.warn('Redis connection error, falling back to memory cache:', err.message);
          this.isRedisAvailable = false;
        });

        this.redisClient.on('connect', () => {
          console.log('✅ Cache service: Connected to Redis');
          this.isRedisAvailable = true;
        });

        await this.redisClient.connect();
      } catch (err) {
        console.warn('Redis initialization failed, using memory cache:', err.message);
        this.isRedisAvailable = false;
      }
    } else {
      console.warn('⚠️ REDIS_URL not set, using in-memory cache (data will be lost on restart)');
    }

    this.startMemoryCacheCleanup();
  }

  startMemoryCacheCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, expiry] of this.memoryCacheTTL) {
        if (now > expiry) {
          this.memoryCache.delete(key);
          this.memoryCacheTTL.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`Memory cache cleanup: Removed ${cleaned} expired entries`);
      }
    }, 60000); // Every minute
  }

  async get(key) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      }
    } catch (err) {
      console.warn(`Redis get error for key ${key}:`, err.message);
    }

    // Fallback to memory cache
    const expiry = this.memoryCacheTTL.get(key);
    if (expiry && Date.now() > expiry) {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }

    return this.memoryCache.get(key) || null;
  }

  async set(key, value, ttl = 3600) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      }
    } catch (err) {
      console.warn(`Redis set error for key ${key}:`, err.message);
    }

    // Always set in memory cache as fallback
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + (ttl * 1000));
  }

  async del(key) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.del(key);
      }
    } catch (err) {
      console.warn(`Redis del error for key ${key}:`, err.message);
    }

    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  async invalidatePattern(pattern) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      }
    } catch (err) {
      console.warn(`Redis pattern delete error:`, err.message);
    }

    // Memory cache pattern matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete = [];

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`Cache: Invalidated ${keysToDelete.length} keys matching pattern ${pattern}`);
    }
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.redisClient) {
      this.redisClient.quit();
    }
  }
}

module.exports = new CacheService();
```

**File: `.env.example` (Add)**

```bash
# Cache Configuration
CACHE_TYPE=redis  # redis or memory
REDIS_URL=redis://localhost:6379  # Optional: Leave empty for memory cache
CACHE_TTL=3600  # Cache time-to-live in seconds
```

**File: `src/server.js` (Update shutdown)**

```javascript
// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  const cacheService = require('./services/cache');
  cacheService.stop();
  
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Estimated Time:** 1.5 hours  
**Test Command:** `npm test -- cache.test.js`  
**Docker Compose (optional):** Add to deployment setup

---

### Task 2.2: Add Pagination Middleware

**File: `src/middleware/pagination.js` (Create new)**

```javascript
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const pagination = (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    parseInt(req.query.limit, 10) || DEFAULT_LIMIT
  );

  req.pagination = {
    page,
    limit,
    skip: (page - 1) * limit
  };

  // Helper to format paginated response
  res.paginate = (data, total) => {
    return {
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };
  };

  next();
};

module.exports = pagination;
```

**File: `src/routes/logs.js` (Example usage)**

```javascript
const pagination = require('../middleware/pagination');

router.get('/', auth, pagination, asyncHandler(async (req, res) => {
  const { skip, limit } = req.pagination;

  // Use skip and limit
  const logs = await Log.find()
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Log.countDocuments();

  res.json(res.paginate(logs, total));
}));
```

**Apply to all list endpoints:**
- `/api/v1/users` (admin)
- `/api/v1/logs`
- `/api/v1/appointments`
- `/api/v1/products`
- etc.

**Estimated Time:** 1 hour

---

## Phase 3: Code Quality

### Task 3.1: Increase Test Coverage Threshold

**File: `jest.config.js` (Update)**

```javascript
coverageThreshold: {
  global: {
    branches: 75,
    functions: 75,
    lines: 75,
    statements: 75
  },
  './src/middleware/auth.js': {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95
  },
  './src/middleware/errorHandler.js': {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90
  },
  './src/middleware/csrf.js': {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85
  },
  './src/services/cache.js': {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

**Add script to check coverage:**

```json
{
  "scripts": {
    "test:coverage:check": "jest --coverage --passWithNoTests",
    "test:coverage:report": "open coverage/lcov-report/index.html"
  }
}
```

**Estimated Time:** 30 minutes + test writing time

---

## Testing & Verification

**After implementing Phase 1 & 2, run:**

```bash
# Full test suite
npm test

# Check coverage
npm run test:coverage:check

# Run specific test file
npm test -- rateLimiter.test.js

# Watch mode for development
npm run test:watch

# Verbose output
npm run test:verbose
```

**Load testing (optional):**
```bash
npm install --save-dev loadtest

# Create src/tests/performance/basic.load.js
npx jest src/tests/performance/basic.load.js --testTimeout=60000
```

---

## Deployment Checklist

Before deploying the changes:

- [ ] All tests passing (`npm test`)
- [ ] Coverage above threshold (`npm run test:coverage:check`)
- [ ] No security warnings (`npm audit`)
- [ ] Environment variables configured (`.env`)
- [ ] Redis available in production (if using)
- [ ] Rate limiting tested with load testing
- [ ] CSRF tokens working in all forms
- [ ] Documentation updated

---

## Rollback Plan

If issues arise:

1. **Cache issues**: Disable Redis in `.env`, use memory cache
2. **Rate limiting issues**: Temporarily increase limits or use `bypass=true` in dev
3. **CSRF issues**: Disable in `csrf.js` (return without verification)
4. **Pagination issues**: Use defaults if query params missing

All changes are backward-compatible with graceful fallbacks.

