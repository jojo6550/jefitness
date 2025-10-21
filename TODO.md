# TODO: Implement Email Verification via OTP using Mailjet API

## Step 1: Install Mailjet SDK
- [x] Add `node-mailjet` to package.json dependencies.
- [x] Run `npm install` to install the new dependency.

## Step 2: Update User Model
- [x] Add fields to User.js: `isEmailVerified` (Boolean, default false), `emailVerificationToken` (String), `emailVerificationExpires` (Date).

## Step 3: Modify Signup Route
- [x] In `src/routes/auth.js`, update `/signup` POST:
  - Generate a 6-digit OTP.
  - Send OTP email via Mailjet.
  - Save user with verification fields, but do not issue JWT or send confirmation email yet.
  - Respond with a message indicating OTP sent.

## Step 4: Add Email Verification Route
- [x] Add new route `/verify-email` in `src/routes/auth.js`:
  - Accept email and OTP.
  - Verify OTP against stored token and expiry.
  - If valid, set `isEmailVerified` to true, clear verification fields, issue JWT, and send confirmation email via Mailjet.

## Step 5: Update Frontend Signup
- [x] In `public/js/auth.js`, modify signup handler:
  - After successful signup response, show OTP input form.
  - Add submit handler for OTP verification, call `/verify-email`.

## Step 6: Update Signup HTML
- [x] In `public/pages/signup.html`, add hidden OTP input section that appears after signup.

## Step 7: Test the Implementation
- [ ] Test signup flow: Submit form, receive OTP email, enter OTP, verify, receive confirmation email.
- [ ] Ensure error handling for invalid OTP, expired tokens, etc.

## Step 8: Update Environment Variables
- [x] Ensure MAILJET_API_KEY and MAILJET_SECRET_KEY are set in .env.
