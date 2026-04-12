# Social Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google, Facebook, Twitter/X, and Apple social login via Passport.js OAuth redirect flow, with account linking and a consent modal for new social users.

**Architecture:** Passport.js strategies registered in `src/config/passport.js`, mounted on existing `src/routes/auth.js`. Shared `verifyOrLinkSocialUser` service handles find-by-provider-ID → link-by-email → create-new logic. New social users are redirected to `/consent` with a short-lived `consentToken` JWT (mirrors the existing 2FA tempToken pattern) before receiving a full session cookie.

**Tech Stack:** passport, passport-google-oauth20, passport-facebook, passport-twitter, passport-apple

**Spec:** `docs/superpowers/specs/2026-04-12-social-login-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/config/passport.js` | Register all 4 Passport strategies |
| Create | `src/services/socialAuthService.js` | `verifyOrLinkSocialUser` — find/link/create user |
| Create | `public/pages/consent.html` | Consent page for new social users |
| Create | `public/js/consent.js` | Submits consent token, redirects to dashboard |
| Create | `src/tests/unit/socialAuthService.test.js` | Unit tests for verifyOrLinkSocialUser |
| Create | `src/tests/unit/socialConsent.test.js` | Unit tests for socialConsent controller |
| Modify | `src/models/User.js` | Add facebookId, twitterId, appleId; make password conditional |
| Modify | `src/middleware/csrf.js` | Bypass CSRF for OAuth callback routes + social-consent |
| Modify | `src/routes/auth.js` | Add social routes, handleSocialCallback, socialConsent route |
| Modify | `src/controllers/authController.js` | Add `socialConsent` function |
| Modify | `src/server.js` | `require('./config/passport')` to init strategies |
| Modify | `public/pages/login.html` | Social buttons below form |
| Modify | `public/pages/signup.html` | Social buttons below form |
| Modify | `.env.example` | Add social provider env vars |

---

## Task 1: Install dependencies + update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Install npm packages**

```bash
cd C:/Users/josia/jefitness
npm install passport passport-google-oauth20 passport-facebook passport-twitter passport-apple
```

Expected output: packages added, no peer-dep errors.

- [ ] **Step 2: Add social env vars to .env.example**

After the existing `GOOGLE_CLIENT_SECRET` line, add:

```
# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_CALLBACK_URL=http://localhost:5500/api/v1/auth/facebook/callback

# Twitter/X OAuth (OAuth 1.0a — enable email in developer portal)
TWITTER_CONSUMER_KEY=your_twitter_consumer_key
TWITTER_CONSUMER_SECRET=your_twitter_consumer_secret
TWITTER_CALLBACK_URL=http://localhost:5500/api/v1/auth/twitter/callback

# Apple Sign In
APPLE_CLIENT_ID=com.yourapp.service
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
# Paste the .p8 key content with \n for newlines, or set via file
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXX\n-----END PRIVATE KEY-----"
APPLE_CALLBACK_URL=https://yourdomain.com/api/v1/auth/apple/callback
```

Also update the existing Google block to add callback URL if missing:
```
GOOGLE_CALLBACK_URL=http://localhost:5500/api/v1/auth/google/callback
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: install passport social login dependencies"
```

---

## Task 2: Update User model

**Files:**
- Modify: `src/models/User.js` (around lines 109–114 for password, line 278 for googleId)

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/socialAuthService.test.js` (partial — model validation tests go here first):

```js
// src/tests/unit/socialAuthService.test.js
const mongoose = require('mongoose');

// We need real schema validation, so use the actual model with mongoose in-memory
// or just test the schema object directly
describe('User model - social auth fields', () => {
  let User;

  beforeAll(() => {
    // Load fresh model (jest module cache may have stale version)
    jest.isolateModules(() => {
      User = require('../../models/User');
    });
  });

  it('validates without password when googleId is present', () => {
    const user = new User({
      email: 'g@test.com',
      firstName: 'Test',
      lastName: 'User',
      googleId: 'gid_123',
      isEmailVerified: true,
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeUndefined();
  });

  it('validates without password when facebookId is present', () => {
    const user = new User({
      email: 'fb@test.com',
      firstName: 'Test',
      lastName: 'User',
      facebookId: 'fbid_123',
      isEmailVerified: true,
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeUndefined();
  });

  it('requires password when no social ID present', () => {
    const user = new User({
      email: 'pw@test.com',
      firstName: 'Test',
      lastName: 'User',
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/tests/unit/socialAuthService.test.js -t "User model" --no-coverage
```

Expected: FAIL — `facebookId` not defined on schema, password still required unconditionally.

- [ ] **Step 3: Add social ID fields + make password conditional in User.js**

In `src/models/User.js`:

Change the `password` field (line ~109) from:
```js
password: {
  type: String,
  required: true,
  minlength: [8, 'Password must be at least 8 characters long'],
  select: false,
},
```
To:
```js
password: {
  type: String,
  required: [
    function () {
      return !this.googleId && !this.facebookId && !this.twitterId && !this.appleId;
    },
    'Password is required',
  ],
  minlength: [8, 'Password must be at least 8 characters long'],
  select: false,
},
```

After the existing `googleId` line (~line 278), add:
```js
facebookId: { type: String, unique: true, sparse: true },
twitterId:  { type: String, unique: true, sparse: true },
appleId:    { type: String, unique: true, sparse: true },
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest src/tests/unit/socialAuthService.test.js -t "User model" --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/User.js src/tests/unit/socialAuthService.test.js
git commit -m "feat: add social ID fields to User model, make password optional for social users"
```

---

## Task 3: Create socialAuthService + full tests

**Files:**
- Create: `src/services/socialAuthService.js`
- Modify: `src/tests/unit/socialAuthService.test.js` (add service tests)

- [ ] **Step 1: Add service tests to existing test file**

Append to `src/tests/unit/socialAuthService.test.js`:

```js
const { verifyOrLinkSocialUser } = require('../../services/socialAuthService');

jest.mock('../../models/User');

describe('verifyOrLinkSocialUser', () => {
  let User;

  beforeEach(() => {
    jest.resetModules();
    User = require('../../models/User');
    jest.clearAllMocks();
  });

  it('returns existing user found by provider ID', async () => {
    const mockUser = { _id: 'uid1', googleId: 'gid1', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValueOnce(mockUser);

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid1',
      email: 'test@test.com', firstName: 'John', lastName: 'Doe',
    });

    expect(result).toEqual({ user: mockUser, isNew: false });
    expect(User.findOne).toHaveBeenCalledWith({ googleId: 'gid1' });
  });

  it('links account when email matches existing user', async () => {
    const mockUser = {
      _id: 'uid1', email: 'test@test.com',
      role: 'user', tokenVersion: 0,
      save: jest.fn().mockResolvedValue(true),
    };
    User.findOne = jest.fn()
      .mockResolvedValueOnce(null)       // not found by googleId
      .mockResolvedValueOnce(mockUser);  // found by email

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid1',
      email: 'test@test.com', firstName: 'John', lastName: 'Doe',
    });

    expect(mockUser.googleId).toBe('gid1');
    expect(mockUser.save).toHaveBeenCalled();
    expect(result).toEqual({ user: mockUser, isNew: false });
  });

  it('creates new user when no match found', async () => {
    const newUser = { _id: 'uid2', email: 'new@test.com', googleId: 'gid2', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValue(null);
    User.create = jest.fn().mockResolvedValueOnce(newUser);
    // findById after create to get tokenVersion
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(newUser),
    });

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid2',
      email: 'new@test.com', firstName: 'Jane', lastName: 'Doe',
    });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@test.com',
      googleId: 'gid2',
      isEmailVerified: true,
    }));
    expect(result).toEqual({ user: newUser, isNew: true });
  });

  it('skips email lookup when email is null', async () => {
    const newUser = { _id: 'uid3', twitterId: 'tid1', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValueOnce(null); // only searched by twitterId
    User.create = jest.fn().mockResolvedValueOnce(newUser);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(newUser),
    });

    await verifyOrLinkSocialUser({
      provider: 'twitter', providerId: 'tid1',
      email: null, firstName: 'TwitterUser', lastName: '',
    });

    // findOne called exactly once (by twitterId), NOT a second time by email
    expect(User.findOne).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (service not created yet)**

```bash
npx jest src/tests/unit/socialAuthService.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../services/socialAuthService'`.

- [ ] **Step 3: Create socialAuthService.js**

Create `src/services/socialAuthService.js`:

```js
const User = require('../models/User');

/**
 * Find, link, or create a user for a social OAuth login.
 *
 * Priority:
 *   1. Find by provider ID (returning social user)
 *   2. Find by email + link provider ID (existing email/password user)
 *   3. Create new social user
 *
 * @param {{ provider: string, providerId: string, email: string|null, firstName: string, lastName: string }}
 * @returns {Promise<{ user: import('../models/User'), isNew: boolean }>}
 */
async function verifyOrLinkSocialUser({ provider, providerId, email, firstName, lastName }) {
  const providerIdField = `${provider}Id`;

  // 1. Returning social user — look up by provider ID
  let user = await User.findOne({ [providerIdField]: providerId }).select('+tokenVersion');
  if (user) return { user, isNew: false };

  // 2. Existing account with matching email — link provider ID
  if (email) {
    user = await User.findOne({ email: email.toLowerCase() }).select('+tokenVersion');
    if (user) {
      user[providerIdField] = providerId;
      await user.save();
      return { user, isNew: false };
    }
  }

  // 3. New user — create and fetch with tokenVersion for JWT signing
  const created = await User.create({
    email: email ? email.toLowerCase() : undefined,
    firstName: firstName || 'User',
    lastName: lastName || '',
    [providerIdField]: providerId,
    isEmailVerified: true,
  });

  const newUser = await User.findById(created._id).select('+tokenVersion');
  return { user: newUser, isNew: true };
}

module.exports = { verifyOrLinkSocialUser };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/tests/unit/socialAuthService.test.js --no-coverage
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/socialAuthService.js src/tests/unit/socialAuthService.test.js
git commit -m "feat: add socialAuthService with find/link/create logic"
```

---

## Task 4: Create Passport strategy config

**Files:**
- Create: `src/config/passport.js`

No unit tests — strategy registration is wired I/O; covered by integration.

- [ ] **Step 1: Create src/config/passport.js**

```js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const AppleStrategy = require('passport-apple');
const { verifyOrLinkSocialUser } = require('../services/socialAuthService');

// ── Google ──────────────────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'google', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Facebook ─────────────────────────────────────────────────────────────────
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      profileFields: ['id', 'emails', 'name'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'facebook', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Twitter/X (OAuth 1.0a) ───────────────────────────────────────────────────
// Requires "Request email from users" enabled in Twitter developer portal.
passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_CONSUMER_KEY,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
      callbackURL: process.env.TWITTER_CALLBACK_URL,
      includeEmail: true,
    },
    async (_token, _tokenSecret, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.displayName?.split(' ')[0] || profile.username || 'User';
        const lastName = profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'twitter', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Apple ────────────────────────────────────────────────────────────────────
// Apple only sends name + email on the FIRST authentication. After that, only
// profile.id is present. We look up by appleId so returning users still work.
passport.use(
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      callbackURL: process.env.APPLE_CALLBACK_URL,
      keyID: process.env.APPLE_KEY_ID,
      // Support multiline key stored with \n in env
      privateKeyString: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    async (_accessToken, _refreshToken, _idToken, profile, done) => {
      try {
        const email = profile.email || null;
        const firstName = profile.name?.firstName || 'User';
        const lastName = profile.name?.lastName || '';
        const result = await verifyOrLinkSocialUser({ provider: 'apple', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

module.exports = passport;
```

- [ ] **Step 2: Commit**

```bash
git add src/config/passport.js
git commit -m "feat: register Passport strategies for Google, Facebook, Twitter, Apple"
```

---

## Task 5: Update CSRF middleware to bypass OAuth callbacks

**Files:**
- Modify: `src/middleware/csrf.js` (lines ~117–131)

- [ ] **Step 1: Add OAuth callback paths to the bypass list**

In `src/middleware/csrf.js`, find the `publicAuthRoutes` array (line ~117) and add the 4 callback paths plus `social-consent`:

```js
const publicAuthRoutes = [
  '/signup',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/resend-verification',
  '/check-verification',
  '/google/callback',
  '/facebook/callback',
  '/twitter/callback',
  '/apple/callback',
  '/social-consent',
];
```

- [ ] **Step 2: Verify no existing tests break**

```bash
npm run test:unit -- --no-coverage 2>&1 | tail -20
```

Expected: all existing backend unit tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/csrf.js
git commit -m "feat: exempt OAuth callback routes and social-consent from CSRF"
```

---

## Task 6: Add social routes + socialConsent to auth.js + authController.js

**Files:**
- Modify: `src/routes/auth.js`
- Modify: `src/controllers/authController.js`
- Create: `src/tests/unit/socialConsent.test.js`

- [ ] **Step 1: Write failing test for socialConsent**

Create `src/tests/unit/socialConsent.test.js`:

```js
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!';
process.env.NODE_ENV = 'test';

jest.mock('../../models/User');

describe('authController.socialConsent', () => {
  let socialConsent;
  let User;
  let req, res, next;

  beforeEach(() => {
    jest.resetModules();
    User = require('../../models/User');
    ({ authController: { socialConsent } } = jest.requireActual('../../controllers/authController'));
    // Re-require after mocking
    const ctrl = require('../../controllers/authController');
    socialConsent = ctrl.socialConsent;

    req = {
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-test' },
      get: (h) => req.headers[h.toLowerCase()],
    };
    res = { cookie: jest.fn(), json: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('grants consent and issues httpOnly cookie for valid token', async () => {
    const consentToken = jwt.sign(
      { userId: 'user123', consentPending: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    req.body.consentToken = consentToken;

    const mockUser = {
      _id: 'user123',
      role: 'user',
      tokenVersion: 0,
      dataProcessingConsent: {},
      healthDataConsent: {},
      save: jest.fn().mockResolvedValue(true),
    };
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    await socialConsent(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockUser.save).toHaveBeenCalled();
    expect(mockUser.dataProcessingConsent.given).toBe(true);
    expect(mockUser.healthDataConsent.given).toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      'token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('calls next with AuthenticationError for expired token', async () => {
    // sign with 0s expiry — already expired
    const expiredToken = jwt.sign(
      { userId: 'uid', consentPending: true },
      process.env.JWT_SECRET,
      { expiresIn: 0 }
    );
    req.body.consentToken = expiredToken;

    await socialConsent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next with AuthenticationError when consentPending flag is missing', async () => {
    const badToken = jwt.sign({ userId: 'uid' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    req.body.consentToken = badToken;

    await socialConsent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/tests/unit/socialConsent.test.js --no-coverage
```

Expected: FAIL — `socialConsent` not defined on authController.

- [ ] **Step 3: Add socialConsent to authController.js**

In `src/controllers/authController.js`, add `socialConsent` to the `authController` object (before the closing `}`):

```js
  /**
   * POST /api/v1/auth/social-consent
   * Accept data consent for new social-login users, then issue a full session JWT.
   */
  socialConsent: asyncHandler(async (req, res) => {
    const { consentToken } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(consentToken, process.env.JWT_SECRET);
    } catch {
      throw new AuthenticationError('Invalid or expired consent token');
    }

    if (!decoded.consentPending) {
      throw new AuthenticationError('Invalid consent token');
    }

    const user = await User.findById(decoded.userId).select('+tokenVersion');
    if (!user) throw new NotFoundError('User not found');

    const now = new Date();
    user.dataProcessingConsent = {
      given: true,
      givenAt: now,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      version: '1.0',
    };
    user.healthDataConsent = {
      given: true,
      givenAt: now,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      version: '1.0',
      purpose: 'fitness_tracking',
    };
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ success: true });
  }),
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest src/tests/unit/socialConsent.test.js --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Add social routes to auth.js**

In `src/routes/auth.js`, replace the two disabled Google route stubs (lines ~346–347):

```js
// ── Google OAuth Route (disabled) ──
router.get('/google', (_req, res) => res.status(503).json({ msg: 'Google login is currently disabled' }));
router.get('/google/callback', (_req, res) => res.redirect('/login?error=google_auth_disabled'));
```

With the full social login routes block:

```js
// ── Social Login (Passport.js redirect flow) ─────────────────────────────────
const passport = require('passport');

/**
 * Shared callback handler — runs after any social provider authenticates.
 * req.user is set by Passport to { user, isNew } from verifyOrLinkSocialUser.
 */
async function handleSocialCallback(req, res) {
  try {
    const { user, isNew } = req.user;

    if (isNew) {
      // New user must accept consent before getting a full session
      const consentToken = jwt.sign(
        { userId: user._id, consentPending: true },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );
      return res.redirect(`/consent?token=${encodeURIComponent(consentToken)}`);
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    setAuthCookie(res, token);
    await User.findByIdAndUpdate(user._id, { lastLoggedIn: new Date() });

    // Role-based redirect mirrors the existing login redirect logic
    const redirectMap = { admin: '/admin', trainer: '/trainer-dashboard' };
    res.redirect(redirectMap[user.role] || '/dashboard');
  } catch (err) {
    logger.error('Social callback error', { error: err.message });
    res.redirect('/login?error=social_auth_failed');
  }
}

// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }),
  handleSocialCallback
);

// Facebook
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=facebook_auth_failed' }),
  handleSocialCallback
);

// Twitter/X (OAuth 1.0a)
router.get('/twitter', passport.authenticate('twitter', { session: false }));
router.get('/twitter/callback',
  passport.authenticate('twitter', { session: false, failureRedirect: '/login?error=twitter_auth_failed' }),
  handleSocialCallback
);

// Apple (POST callback — Apple uses response_mode: form_post)
router.get('/apple', passport.authenticate('apple', { session: false }));
router.post('/apple/callback',
  passport.authenticate('apple', { session: false, failureRedirect: '/login?error=apple_auth_failed' }),
  handleSocialCallback
);

// ── Social Consent ────────────────────────────────────────────────────────────
router.post(
  '/social-consent',
  requireDbConnection,
  authLimiter,
  [
    body('consentToken').notEmpty().withMessage('Consent token is required'),
    handleValidationErrors,
  ],
  authController.socialConsent
);
```

- [ ] **Step 6: Run all unit tests — verify nothing broke**

```bash
npm run test:unit -- --no-coverage 2>&1 | tail -30
```

Expected: all tests PASS including new socialConsent tests.

- [ ] **Step 7: Commit**

```bash
git add src/routes/auth.js src/controllers/authController.js src/tests/unit/socialConsent.test.js
git commit -m "feat: add social login routes and socialConsent controller"
```

---

## Task 7: Initialize Passport in server.js

**Files:**
- Modify: `src/server.js`

- [ ] **Step 1: Add passport initialization**

In `src/server.js`, after the `require('dotenv').config()` block and before the routes, add:

```js
// Initialize Passport strategies (no sessions — JWT-only)
require('./config/passport');
const passport = require('passport');
```

Then add `passport.initialize()` to the middleware stack. Find the line `app.use(userCacheMiddleware);` and add after it:

```js
app.use(passport.initialize());
```

- [ ] **Step 2: Start the dev server — verify no startup errors**

```bash
npm run dev 2>&1 | head -20
```

Expected: server starts, no `Cannot find module` or passport errors.

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat: initialize Passport middleware in Express app"
```

---

## Task 8: Create consent page

**Files:**
- Create: `public/pages/consent.html`
- Create: `public/js/consent.js`

The clean URL handler in `server.js` already maps `/consent` → `public/pages/consent.html` automatically.

- [ ] **Step 1: Create public/pages/consent.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JE Fitness – Accept Terms</title>
  <meta name="robots" content="noindex, nofollow">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
  <link href="/fonts/bootstrap-icons.css" rel="stylesheet">
  <link rel="preload" href="../styles/styles.css" as="style">
  <link rel="stylesheet" href="../styles/styles.css">
  <link rel="apple-touch-icon" sizes="180x180" href="../favicons/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="../favicons/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../favicons/favicon-16x16.png">
  <link rel="manifest" href="../favicons/site.webmanifest">
</head>
<body class="login-page">

  <nav class="navbar navbar-expand-lg navbar-dark sticky-top">
    <div class="container">
      <a class="navbar-brand" href="/">JE Fitness</a>
    </div>
  </nav>

  <div class="login-container">
    <form class="login-form" id="consent-form" novalidate>
      <h1>One Last Step</h1>
      <p class="text-muted mb-4">To complete your account, please accept our terms.</p>

      <div class="mb-3 p-3 rounded" style="background: var(--card-bg, #1e1e2e); border: 1px solid var(--border-color, #333);">
        <p class="small mb-2"><strong>By continuing you agree to:</strong></p>
        <ul class="small mb-0">
          <li>Our <a href="#" class="text-primary">Terms of Service</a></li>
          <li>Processing of your data for fitness tracking purposes</li>
          <li>Storage of health-related data you choose to enter</li>
        </ul>
      </div>

      <div id="consent-error" class="text-danger small mb-3"></div>

      <button type="submit" class="btn btn-login w-100" id="consentButton">
        Accept &amp; Continue
      </button>

      <div class="mt-3 text-center">
        <a href="/login" class="text-muted small">Cancel and go back to login</a>
      </div>
    </form>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="../js/api.config.js"></script>
  <script src="../js/consent.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/consent.js**

```js
(function () {
  const params = new URLSearchParams(window.location.search);
  const consentToken = params.get('token');

  // No token — nothing to consent to; back to login
  if (!consentToken) {
    window.location.href = '/login';
    return;
  }

  const form = document.getElementById('consent-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('consentButton');
    const errEl = document.getElementById('consent-error');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Please wait...';

    try {
      const res = await window.API.request('/api/v1/auth/social-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentToken }),
      });

      if (res.success) {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Accept & Continue';
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
    }
  });
})();
```

- [ ] **Step 3: Commit**

```bash
git add public/pages/consent.html public/js/consent.js
git commit -m "feat: add consent page for new social login users"
```

---

## Task 9: Add social buttons to login.html and signup.html

**Files:**
- Modify: `public/pages/login.html`
- Modify: `public/pages/signup.html`

Layout B: email/password form first, social buttons below with divider.

- [ ] **Step 1: Add social buttons to login.html**

In `public/pages/login.html`, find the closing `</form>` tag (line ~64) and insert before it:

```html
      <hr class="mt-4 mb-3" style="border-color:#333;">
      <p class="text-center text-muted mb-3" style="font-size:0.8rem; letter-spacing:0.05em;">OR CONTINUE WITH</p>
      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <a href="/api/v1/auth/google" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google
        </a>
        <a href="/api/v1/auth/facebook" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Facebook
        </a>
        <a href="/api/v1/auth/twitter" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          X
        </a>
        <a href="/api/v1/auth/apple" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
          Apple
        </a>
      </div>
```

- [ ] **Step 2: Add social buttons to signup.html**

In `public/pages/signup.html`, find `<button type="submit" class="btn btn-signup">Sign Up</button>` (line ~99) and insert after it (still inside the form, before `</form>`):

```html
      <hr class="mt-4 mb-3" style="border-color:#333;">
      <p class="text-center text-muted mb-3" style="font-size:0.8rem; letter-spacing:0.05em;">OR SIGN UP WITH</p>
      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <a href="/api/v1/auth/google" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google
        </a>
        <a href="/api/v1/auth/facebook" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Facebook
        </a>
        <a href="/api/v1/auth/twitter" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          X
        </a>
        <a href="/api/v1/auth/apple" class="btn btn-outline-secondary d-flex align-items-center gap-2" style="font-size:0.85rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
          Apple
        </a>
      </div>
```

- [ ] **Step 3: Verify page renders in browser**

```bash
npm run dev
```

Open `http://localhost:5500/login` — confirm social buttons appear below the Login button with divider. Open `http://localhost:5500/signup` — confirm same below Sign Up button.

- [ ] **Step 4: Run full test suite**

```bash
npm test -- --no-coverage 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/pages/login.html public/pages/signup.html
git commit -m "feat: add social login buttons to login and signup pages"
```

---

## Verification Checklist

End-to-end tests to run manually after all tasks complete (requires real OAuth credentials in `.env`):

- [ ] Google login with new email → lands on `/consent` → accept → `/dashboard`
- [ ] Google login with existing email/password account → accounts linked → `/dashboard`
- [ ] Google login (returning) → straight to `/dashboard` (no consent)
- [ ] Facebook, Twitter, Apple — same three cases as above
- [ ] Logout → cookie cleared → social button redirects to provider again
- [ ] Existing email+password login still works
- [ ] `/consent` with no `?token` → redirects to `/login`
- [ ] Expired consent token (wait 10 min or mock) → error message shown
- [ ] Apple POST callback not blocked by CSRF

> **DB note:** The email index change (`sparse: true`) requires dropping and recreating the email unique index on first deploy. Run in mongo shell:
> ```js
> db.users.dropIndex("email_1")
> db.users.createIndex({ email: 1 }, { unique: true, sparse: true })
> ```
