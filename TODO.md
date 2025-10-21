# TODO: Implement Password Reset Functionality

## Step 1: Update User Model
- [x] Add fields to User.js: `resetToken` (String), `resetExpires` (Date).

## Step 2: Add "Forgot Password?" Link to Login Page
- [x] Update `public/pages/login.html` to include a "Forgot Password?" link below the login button.

## Step 3: Create Forgot Password Page
- [x] Create `public/pages/forgot-password.html` with a form to enter email address.

## Step 4: Create Reset Password Page
- [x] Create `public/pages/reset-password.html` with a form to enter new password (token from URL).

## Step 5: Add Forgot Password Route
- [x] Add POST `/forgot-password` route in `src/routes/auth.js`:
  - Generate secure reset token.
  - Save token and expiration to user.
  - Send reset email via Mailjet with link containing token.

## Step 6: Add Reset Password Route
- [x] Add POST `/reset-password` route in `src/routes/auth.js`:
  - Verify token and expiration.
  - Hash new password and update user.
  - Clear reset fields.

## Step 7: Update Frontend Auth JS
- [x] Update `public/js/auth.js` to handle forgot password and reset password forms.

## Step 8: Test the Implementation
- [ ] Test full flow: Request reset, receive email, reset password, login with new password.
- [ ] Ensure security: Tokens expire, one-time use, proper error handling.

## Step 9: Update Environment Variables
- [x] Ensure FRONTEND_URL is set in .env for reset links.
