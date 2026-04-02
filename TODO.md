 1. Email Service — No Emails Sent at All

 - What's missing: No signup verification email, no password reset email, no payment receipt email
 - Impact: isEmailVerified defaults to true — any email can be registered without confirmation. Forgot-password page exists on frontend but no     
 backend endpoint or token model exists.
 - Files to add: src/services/email.js, src/models/PasswordReset.js, src/routes/passwordReset.js
 -  Add POST /api/v1/auth/forgot-password and POST /api/v1/auth/reset-password endpoints.  

  11. Two-Factor Authentication (2FA)

 - What's missing: No MFA of any kind.
 - Suggestion: Add TOTP-based 2FA (using speakeasy or otpauth). Add setup endpoint, QR code generation, and verification middleware.

 12. Social Login (Google / Apple)

 - What's missing: No OAuth providers.
 - Suggestion: Add Passport.js with Google OAuth2 strategy. Minimal changes: add googleId to User model, add /auth/google and
 /auth/google/callback routes.

  25. Password Change in Profile

 - What's missing: Users cannot change their password from the profile page; they must use the forgot-password flow.
 - File: public/pages/profile.html, src/routes/users.js
 - Suggestion: Add a "Change Password" section to profile that takes current password + new password. Add POST /api/v1/users/change-password       
 endpoint.

 30. Centralize API Calls on Frontend

 - What's missing: Only SubscriptionService.js exists as a centralized service. Other features (appointments, workouts, products) make raw fetch() 
  calls inline.
 - Suggestion: Create public/js/services/AppointmentService.js, WorkoutService.js, ProductService.js following the same pattern as
 SubscriptionService.js.

 16. Subscription Renewal Reminders

 - What's missing: No email or in-app notification before subscription renews or expires.
 - File: src/jobs.js
 - Suggestion: Add a daily cron that finds subscriptions expiring in 3 and 7 days and sends reminder emails / creates notifications.

 13. Workout Goal Setting & Progress Milestones

 - What's missing: Users can log workouts and see progress charts but cannot set goals (e.g., "bench press 200 lbs by June").
 - Suggestion: Add goals sub-document to User model (or separate WorkoutGoal model) with target exercise, target weight, target date. Show
 milestone completion in workout-progress.html.

 14. Body Measurements Tracking

 - What's missing: Profile has starting/current weight and BMI, but no neck/waist/hip/chest measurements over time.
 - Suggestion: Add a measurements array to User model (date, weight, neck, waist, hips, chest). Show trend charts on profile page.
 7. Appointment Conflict Detection

 - What's missing: No check for double-booking a trainer on the same date/time.
 - File: src/routes/appointments.js
 - Suggestion: Query for existing appointments with the same trainerId, date, time before creating a new one. Return 409 Conflict if slot is       
 taken.