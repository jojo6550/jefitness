# Social Login Design

**Date:** 2026-04-12  
**Providers:** Google, Facebook, Twitter/X, Apple  
**Approach:** Passport.js redirect flow

## Context

JeFitness currently has email/password auth with JWT httpOnly cookies, email verification, 2FA, and token versioning. Google OAuth routes exist but are disabled (return 503). This spec adds full social login for all 4 providers using the existing auth infrastructure.

## Architecture

Passport.js strategies registered in `src/config/passport.js`, mounted on existing `src/routes/auth.js`. No new route file. Shared verify callback logic in `src/controllers/authController.js`.

## Routes

```
GET /api/v1/auth/google              → passport.authenticate('google')
GET /api/v1/auth/google/callback     → verify → cookie → redirect
GET /api/v1/auth/facebook
GET /api/v1/auth/facebook/callback
GET /api/v1/auth/twitter
GET /api/v1/auth/twitter/callback
GET /api/v1/auth/apple
POST /api/v1/auth/apple/callback     (Apple requires POST + form_post response_mode)
POST /api/v1/auth/social-consent     → grant consent for new social users → issue JWT
```

## Verify Callback Logic (shared)

1. Provider returns `{ email, providerId, provider }`
2. Find user by provider ID field (e.g. `googleId`) → found → issue JWT cookie → redirect to dashboard
3. Not found by provider ID → find by email
   - Email match → link: set provider ID on user → issue JWT → redirect to dashboard
   - No match → create new user (`isEmailVerified: true`, no password) → issue short-lived `consentToken` JWT (10min, `consentPending: true`) → redirect to `/consent?token=<consentToken>`
4. On `/consent` submit → `POST /api/v1/auth/social-consent { consentToken }` → verify token → grant dataProcessingConsent + healthDataConsent → issue full JWT cookie → redirect to dashboard

## User Model Changes

Add to `src/models/User.js`:
```js
facebookId: { type: String, sparse: true, unique: true }
twitterId:  { type: String, sparse: true, unique: true }
appleId:    { type: String, sparse: true, unique: true }
// googleId already exists
```

`password` field is not required for social-only users — change validator to `required: function() { return !this.googleId && !this.facebookId && !this.twitterId && !this.appleId; }`.

## New Files

- `src/config/passport.js` — strategy registration, shared verify callback
- `public/pages/consent.html` — consent modal for new social users
- `public/js/consent.js` — submits consent, then fetches JWT

## Modified Files

- `src/routes/auth.js` — replace disabled Google stubs, add FB/Twitter/Apple routes, add `/social-consent`
- `src/controllers/authController.js` — add `socialConsent()` controller
- `src/models/User.js` — add `facebookId`, `twitterId`, `appleId`; make `password` optional
- `src/server.js` — `require('./config/passport')` to initialize strategies
- `public/pages/login.html` — add social buttons below form (Layout B)
- `public/pages/signup.html` — add social buttons below form (Layout B)

## UI Layout (Login & Signup)

Email/password form at top → divider "or continue with" → 4 social buttons below (Google, Facebook, X, Apple). Buttons are plain `<a href="/api/v1/auth/google">` links — no JS required.

## Security Notes

- Social login skips 2FA (intentional — provider already authenticated user)
- Social login sets `isEmailVerified: true` on new users
- OAuth state param handled by Passport (CSRF protection built-in)
- Apple uses `response_mode: form_post` — callback must be POST route
- httpOnly cookie issued identically to password login
- `tokenVersion` applies — logout still invalidates social sessions

## Dependencies

```
passport
passport-google-oauth20
passport-facebook
passport-twitter-oauth2  (or passport-twitter)
passport-apple
```

## Verification

1. Click Google → redirects to Google → comes back → lands on dashboard (existing user) or `/consent` (new)
2. Same email as existing account → account linked, no duplicate user created
3. New user completes consent → redirected to dashboard, consent recorded in DB
4. Logout → cookie cleared → social login required again (no session reuse)
5. Apple flow works (POST callback)
6. Existing email+password login still works
