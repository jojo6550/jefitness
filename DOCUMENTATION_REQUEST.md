# Comprehensive Codebase Documentation Request

## Project Overview
**JEFitness** — A multi-page fitness application with:
- Express 5 backend + MongoDB
- Static HTML/JS frontend (not a SPA)
- Stripe subscription system
- Trainer/client appointments
- Workout logging and nutrition tracking
- Admin dashboard

## Codebase Structure

### Backend Files (`src/`)

#### Config & Setup
- `src/server.js` — Express entry point
- `src/config/security.js` — Security configurations
- `src/config/subscriptionConstants.js` — Subscription tier constants
- `src/jobs.js` — Cron jobs

#### Middleware (`src/middleware/`)
- `auth.js` — JWT authentication
- `apiKeyAuth.js` — API key validation
- `protectedRoute.js` — Route protection
- `subscriptionAuth.js` — Subscription verification
- `ownershipVerification.js` — Ownership checks
- `cacheControl.js` — Cache headers
- `corsConfig.js` — CORS setup
- `csrf.js` — CSRF protection
- `dbConnection.js` — MongoDB connection
- `errorHandler.js` — Error handling
- `inputValidator.js` — Input validation
- `requestLogger.js` — Request logging
- `requestValidator.js` — Request schema validation
- `sanitizeInput.js` — Input sanitization
- `securityHeaders.js` — Security headers
- `rateLimiter.js` — Rate limiting
- `versioning.js` — API versioning
- `consent.js` — Consent management

#### Models (`src/models/`)
- `User.js`
- `Subscription.js`
- `StripePlan.js`
- `Appointment.js`
- `TrainerAvailability.js`
- `Program.js`
- `Purchase.js`
- `Notification.js`
- `Log.js`
- `UserActionLog.js`
- `WebhookEvent.js`

#### Routes & Controllers (`src/routes/` and `src/controllers/`)
- Routes: `auth.js`, `admin.js`, `appointments.js`, `cache.js`, `clients.js`, `gdpr.js`, `logs.js`, `medical-documents.js`, `nutrition.js`, `plans.js`, `products.js`, `programs.js`
- Controllers: `authController.js`, `subscriptionController.js`, `trainerController.js`, `workoutController.js`, `nutritionController.js`

#### Services
- `src/services/stripe.js` — Stripe integration
- `src/services/email.js` (if exists)
- `src/utils/dateUtils.js` — Date calculations

#### Documentation
- `src/docs/swagger.js` — API documentation

### Frontend Files (`public/js/`)

#### Configuration & Core
- `api.config.js` — API configuration
- `logger.js` — Logging utility
- `validators.js` — Input validators
- `toast.js` — Toast notifications
- `cache-version.js` — Cache busting
- `tailwind.js` — Tailwind utilities

#### Services (`public/js/services/`)
- `SubscriptionService.js`
- `AppointmentService.js`
- `ProductService.js`
- `WorkoutService.js`

#### Pages/Features
- `app.js` — Main app logic
- `auth.js` — Authentication
- `dashboard.js` — User dashboard
- `dashboard-init.js` — Dashboard initialization
- `profile.js` — User profile
- `onboarding.js` — Onboarding flow
- `subscriptions.js` — Subscription management
- `view-subscription.js` — View active subscription
- `navbar-subscription.js` — Subscription badge
- `products.js` — Product browsing
- `cart.js` — Shopping cart
- `appointments.js` — Appointment booking
- `log-workout.js` — Workout logging
- `log-meal.js` — Nutrition logging
- `nutrition-history.js` — Nutrition history
- `workout-progress.js` — Progress tracking
- `my-programs.js` — User programs
- `program-marketplace.js` — Program discovery
- `program-access.js` — Program access control
- `bmi.js` — BMI calculator
- `gym-tour.js` — Gym tour feature
- `coming-soon.js` — Coming soon page
- `verify-email.js` — Email verification
- `role-guard.js` — Role-based access

#### Admin & Trainer
- `admin-dashboard.js`
- `admin-logs.js`
- `admin-notifications.js`
- `trainer-dashboard.js`
- `trainer-guide.js`

#### Other
- `logout.js` — Logout flow
- `cookie-consent.js` — Cookie consent
- `medical-documents.js` — Medical document upload

## Documentation Requirements

### Format
- **Markdown** with clear section hierarchies
- **Code examples** where helpful
- **ASCII diagrams** for flows and architecture
- **Hyperlinks** between related sections

### Structure for Each File

**Backend Files:**
1. **Purpose** — What does this file do?
2. **Exports** — What does it export/do?
3. **Dependencies** — What does it depend on?
4. **Key Functions** — For each function:
   - Signature
   - Purpose
   - Parameters (with types)
   - Return value
   - Side effects
   - Example usage (if applicable)
5. **Data structures** — Any important objects/constants
6. **Notes** — Important implementation details, gotchas

**Frontend Files:**
1. **Purpose**
2. **Exports** — Functions, classes, constants
3. **Dependencies**
4. **Key Functions/Methods** — Same detail as backend
5. **DOM Elements** — Elements this file interacts with
6. **API Calls** — What endpoints does it hit?
7. **State** — Any global state or localStorage usage
8. **Event Handlers** — Key events and listeners

### High-Level Sections

1. **Architecture Overview**
   - System diagram
   - Technology stack
   - Design patterns

2. **Backend Architecture**
   - Request flow (middleware → controller → model → response)
   - Authentication & authorization
   - Database schema overview
   - Stripe integration flow
   - Error handling strategy

3. **Frontend Architecture**
   - Page structure
   - Service layer pattern
   - API communication
   - State management
   - Security (CSRF, XSS, etc.)

4. **User Flows**
   - Authentication flow (signup, login, JWT)
   - Subscription flow (plan selection → checkout → activation)
   - Appointment booking flow
   - Workout logging flow
   - Nutrition tracking flow
   - Admin dashboard flow
   - Trainer flow

5. **Database Schema**
   - Collections and fields
   - Relationships
   - Indexes

6. **API Endpoints**
   - Organized by resource
   - Method, path, auth required
   - Request/response schemas
   - Error codes

7. **File-by-File Documentation**
   - Backend files (detailed)
   - Frontend files (detailed)

8. **Integration Points**
   - Stripe webhook handling
   - Email notifications
   - Scheduled jobs
   - Third-party services

9. **Security**
   - Authentication (JWT)
   - Authorization (roles, ownership)
   - Input validation
   - CSRF protection
   - Rate limiting
   - CORS policy

10. **Configuration & Environment**
    - Environment variables
    - Configuration files
    - Secrets management

## Key Context (from CLAUDE.md)

- App is **not a SPA** — each page loads its own JS file
- Routes prefixed `/api/v1/`
- JWT tokens in `localStorage`, sent as `Authorization: Bearer`
- All date math uses `src/utils/dateUtils.js`
- Always use `window.ApiConfig.getAPI_BASE()` for API calls
- Subscription state synced from Stripe via webhooks and on-demand `/refresh`
- Pre-save hook on Subscription auto-cancels on Stripe when status = 'canceled'

## Deliverable

A comprehensive **Codebase Documentation Bible** (single markdown file or organized markdown files) that allows:
- **Humans** to understand the entire codebase architecture and implementation
- **AI** (Claude or other LLMs) to understand context and generate accurate code changes
- **Onboarding** of new developers
- **Reference** for how features work end-to-end

---

## Instructions for Claude Opus

Please generate comprehensive documentation following the structure above. For each file:

1. Read the actual file content
2. Extract all functions, classes, and their signatures
3. Analyze logic flow and purpose
4. Document parameters, returns, and side effects
5. Identify dependencies and relationships
6. Create clear, accurate descriptions

Prioritize accuracy over brevity. Be thorough. Include code examples where they clarify behavior.

Start with architecture overviews, then organize file-by-file documentation in a logical order (e.g., backend setup → middleware → models → controllers → routes, then frontend config → services → pages → features).

The output should be readable, well-organized, and serve as a single source of truth for the codebase.
