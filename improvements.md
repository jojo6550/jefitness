╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ JE Fitness Platform — Improvements & Feature Backlog                                                                                              
                                                                                                                                                   
 Context                                                                                                                                           

 Task from TODO.md: compile a list of improvements and features that can be added to make the platform better. This list is derived from a full    
 codebase audit of the frontend (public/pages/, public/js/), backend (src/routes/, src/controllers/, src/services/, src/models/), and
 configuration.

 ---
 CRITICAL GAPS (Broken or Missing Core Functionality)

scription Plan Upgrade / Downgrade

 - What's missing: No endpoint to switch between plans (1-month → 12-month, etc.). stripe.js has updateSubscription() but it's never called from a 
  route.
 - Files affected: src/routes/subscriptions.js, src/controllers/subscriptionController.js, src/services/stripe.js
 - Suggestion: Add PUT /api/v1/subscriptions/:id/change-plan that calls stripe.updateSubscription() with proration behavior.

 3. Dashboard "Coming Soon" Cards Point to Working Pages

 - What's missing: Dashboard cards for My Programs, Program Marketplace, and Products show "Coming Soon" but all three pages are fully
 implemented.
 - File: public/pages/dashboard.html, public/js/dashboard.js
 - Suggestion: Remove "Coming Soon" badges and enable navigation to /my-programs, /program-marketplace, /products.

 4. Password Reset Has No Backend

 - What's missing: public/pages/forgot-password.html and reset-password.html exist but there are no corresponding API endpoints.
 - Suggestion: Add password reset token model, /auth/forgot-password sends email with token, /auth/reset-password validates token and updates      
 password.

 ---
 HIGH PRIORITY FEATURES

 5. Trainer Availability / Scheduling System

 - What's missing: No TrainerAvailability model. Appointment time slots are hardcoded to 5am–1pm in the frontend with no server-side conflict      
 detection. Two trainers exist but no way to assign slots.
 - Files: src/models/, src/routes/trainer.js, public/js/appointments.js
 - Suggestion: Add TrainerAvailability model (trainer, day-of-week, time slots). Add endpoint GET /api/v1/trainer/:id/availability. Front-end      
 appointment modal should fetch and display only open slots.

 6. Subscription Invoice Download (PDF)

 - What's missing: Invoices are listed in the UI but are not downloadable. Stripe provides hosted invoice URLs.
 - Files: src/controllers/subscriptionController.js, public/js/view-subscription.js
 - Suggestion: Include hosted_invoice_url and invoice_pdf from Stripe in the invoice API response. Add a "Download PDF" link in the UI.

 7. Appointment Conflict Detection

 - What's missing: No check for double-booking a trainer on the same date/time.
 - File: src/routes/appointments.js
 - Suggestion: Query for existing appointments with the same trainerId, date, time before creating a new one. Return 409 Conflict if slot is       
 taken.

 8. Refund Handling

 - What's missing: No refund endpoint exists. Product purchases and program purchases have no return path.
 - Files: src/routes/, src/services/stripe.js
 - Suggestion: Add POST /api/v1/purchases/:id/refund that calls Stripe's refunds.create(). Require admin role or within-window eligibility.        

 9. Payment Method Management

 - What's missing: Users cannot update their saved card without going through full checkout again.
 - Suggestion: Add Stripe Customer Portal session endpoint (POST /api/v1/subscriptions/billing-portal) which redirects users to Stripe's hosted    
 portal for card management, invoice history, and plan changes.

 10. Push Notifications / In-App Notification System

 - What's missing: Notification model exists in the DB but is never surfaced to users. No in-app bell icon or push notification integration.       
 - Files: src/models/Notification.js, public/js/
 - Suggestion: Add GET /api/v1/notifications and PUT /api/v1/notifications/:id/read endpoints. Add notification bell to navbar. Use for
 appointment reminders, subscription expiry warnings, and new program alerts.

 ---
 MEDIUM PRIORITY IMPROVEMENTS

 11. Two-Factor Authentication (2FA)

 - What's missing: No MFA of any kind.
 - Suggestion: Add TOTP-based 2FA (using speakeasy or otpauth). Add setup endpoint, QR code generation, and verification middleware.

 12. Social Login (Google / Apple)

 - What's missing: No OAuth providers.
 - Suggestion: Add Passport.js with Google OAuth2 strategy. Minimal changes: add googleId to User model, add /auth/google and
 /auth/google/callback routes.




 15. GDPR Data Retention Cron Job

 - What's missing: compliance.js has performDataRetentionCleanup() but it's never scheduled. GDPR requires automatic purging of stale data.        
 - File: src/jobs.js
 - Suggestion: Add a monthly cron job that calls performDataRetentionCleanup(). Log the result.


 17. Admin Analytics Dashboard

 - What's missing: admin-dashboard.html exists (55KB JS) but no dedicated analytics endpoint for revenue trends, signup rates, churn.
 - Suggestion: Add GET /api/v1/admin/analytics aggregating: MRR, new signups per week, active vs. churned subscriptions, popular programs,
 appointment counts.

 18. Trainer-to-Client Assignment

 - What's missing: Trainers can see all clients but there's no formal assignment. trainer_dashboard.html shows a general client list.
 - Suggestion: Add assignedTrainerId to User model. Add admin endpoint to assign/reassign trainers. Filter trainer dashboard to only show their    
 assigned clients.

 19. Abandoned Cart Recovery

 - What's missing: Cart is stored in localStorage only. No server-side tracking. No recovery email.
 - Suggestion: Persist cart server-side when user is logged in. Add a cron job to identify carts not checked out after 24 hours and trigger a      
 recovery email.

 20. Program Content — Interactive Delivery

 - What's missing: Purchased programs are static HTML files (e.g., public/pages/programs/8-week-eds-safe-strength-fat-loss-program.html). No       
 progress tracking within programs.
 - Suggestion: Add userProgramProgress tracking: current week, completed workouts within the program. Surface progress on my-programs.html.        

 ---
 UX & DESIGN IMPROVEMENTS

 21. Dark Mode

 - Suggestion: Add a CSS class toggle on <body> with a switch in the navbar. Store preference in localStorage.

 22. Onboarding Flow for New Users

 - What's missing: After signup, users land on the dashboard with no guidance.
 - Suggestion: Add a multi-step onboarding modal (fill in profile → choose plan → book first appointment). Show only once, track completion in     
 User model.

 23. Mobile Navbar Improvements

 - What's missing: Hamburger menu may hide the subscription badge and key nav items on small screens.
 - Suggestion: Audit navbar-subscription.js and HTML navbars across all pages for mobile breakpoints.

 24. Post-Checkout Confirmation Page

 - What's missing: After Stripe redirects back, the subscriptions page silently loads. No explicit "Payment successful" screen.
 - File: public/js/subscriptions.js
 - Suggestion: When ?success=true is in the URL, show a dedicated confirmation banner/modal with order details before rendering the standard page. 

 

 26. Appointment Time Slot Expansion

 - What's missing: Time slots are hardcoded to 5am–1pm in the frontend.
 - File: public/js/appointments.js
 - Suggestion: Dynamically generate time slots from trainer availability data (see item 5). Until then, expand hardcoded range to at least
 6am–8pm.

 27. Empty State Illustrations

 - What's missing: Empty states for workout history, cart, and programs use plain text only.
 - Suggestion: Add simple SVG illustrations or icons for empty states to improve perceived quality.

 ---
 TECHNICAL DEBT & CODE QUALITY

 28. Test Coverage — Critical Gap

 - What exists: Only 5 test files, all focused on utilities and webhooks. No controller, route, or service tests.
 - Suggestion: Add integration tests using supertest for: auth flow, subscription checkout, appointment CRUD, workout logging, GDPR endpoints.     
 Target 70%+ coverage.

 29. PRODUCT_IDS Constant Is Undefined

 - File: src/services/stripe.js:331
 - Bug: References PRODUCT_IDS but the correct constant is PRODUCT_MAP (from config). This likely causes a silent failure in product lookup.       
 - Fix: Replace PRODUCT_IDS with PRODUCT_MAP at that line.


 31. Console.log Cleanup

 - What's present: Mix of console.log and the logger service across backend files.
 - Suggestion: Replace all console.log in src/ with appropriate logger.info/warn/error() calls.

 32. Swagger Documentation Completeness

 - What's missing: Swagger exists but many routes (GDPR, medical documents, trainer) lack full spec documentation.
 - Suggestion: Add OpenAPI annotations to all undocumented routes, especially the GDPR and medical endpoints.

 33. Periodic Stripe Reconciliation

 - What's missing: Subscription sync only happens via webhook. If a webhook is missed, the DB can drift from Stripe's state.
 - Suggestion: Add a weekly cron job that reconciles all active subscriptions in the DB against Stripe's API, correcting any mismatches.

 ---
 NEW FEATURE IDEAS (Future Roadmap)

 34. Live Chat or Messaging Between Client and Trainer

 - Add a real-time messaging feature (Socket.io) so clients can message their assigned trainer directly in the app.

 35. Group Classes / Events Calendar

 - Add a ClassEvent model for group fitness sessions with capacity limits. Users can register; trainer can mark attendance.

 36. Nutrition / Meal Tracking

 - Add a meal log (food, calories, macros) similar to the workout log. Integrate with a food database API (e.g., Open Food Facts).

 37. Wearable / Health App Integration

 - Allow users to import workout data from Apple Health, Google Fit, or Fitbit via OAuth.

 38. Referral / Loyalty Program

 - Add a referral code system. Reward users with discount credits for referring new subscribers.

 39. Progress Photos

 - Allow users to upload and privately store progress photos (similar to medical documents). Show a date-sorted photo timeline.

 40. Video Content Library

 - Add a VideoContent model for trainer-uploaded instructional videos tied to programs or exercises. Stream via signed URLs.

 ---
 Verification

 To validate improvements as they're implemented:
 - Run npm test after each backend change
 - Run npm run dev:full and manually test affected pages
 - Check GET /api/health to confirm DB connectivity
 - Use Stripe test mode (existing test keys) for payment flow testing
 - Run Cypress (npx cypress open) for E2E flows