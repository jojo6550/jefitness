# TODO: Fix Mailjet Build Issue on Render

## Steps to Complete:
- [ ] Remove node-mailjet dependency from package.json
- [ ] Update src/routes/auth.js to use fetch for Mailjet API calls instead of node-mailjet Client
- [ ] Test the changes locally if possible
- [ ] Deploy to Render to verify the fix

## Details:
- Replace the Mailjet Client with direct fetch calls to Mailjet's Send API v3.1
- Use MAILJET_API_KEY and MAILJET_SECRET_KEY from environment variables
- Ensure all email sending functions (signup OTP, forgot password, verification confirmation) are updated
