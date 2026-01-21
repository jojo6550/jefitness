# JE Fitness API Documentation

## Overview

JE Fitness is a comprehensive fitness application API that provides user management, workout tracking, subscription management, program marketplace, medical document handling, appointment scheduling, and trainer-client interactions. The API is built with Express.js and follows RESTful principles with JWT authentication.

### Key Features
- **User Management**: Registration, authentication, profile management
- **Subscription Management**: Stripe integration for recurring payments
- **Workout Tracking**: Log workouts, track progress, view statistics
- **Program Marketplace**: Purchase and access fitness programs
- **Medical Documents**: Upload, store, and manage health documents
- **Appointments**: Schedule and manage trainer appointments
- **GDPR/HIPAA Compliance**: Data protection and user consent management
- **Role-Based Access**: User, trainer, and admin roles

## Authentication

The API uses JWT (JSON Web Token) authentication with role-based access control.

### Authentication Flow
1. User registers with email/password
2. Email verification required before login
3. JWT token issued upon successful login
4. Token must be included in `Authorization: Bearer <token>` header

### User Roles
- **user**: Regular users who can track workouts and purchase programs
- **trainer**: Can manage clients, view appointments, access client data
- **admin**: Full system access including user management and logs

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## API Versioning

The API uses URL-based versioning with the prefix `/api/v1/`.

### Version Header
All responses include the `X-API-Version: v1` header.

### Backward Compatibility
Legacy routes (without `/v1/`) are redirected to current version.

## Base URL and Environments

### Production
```
https://jefitness.com/api/v1
```

### Development
```
http://localhost:5000/api/v1
```

### Health Check
```
GET /api/health
```

## Security

### HTTPS Only
All production traffic must use HTTPS.

### CORS Policy
- Origins: `https://jefitness.com`, configured frontend URLs
- Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- Headers: Content-Type, Authorization, X-Auth-Token
- Credentials: Allowed

### Input Validation
- All inputs are sanitized and validated
- NoSQL injection prevention
- XSS protection through input sanitization

### Rate Limiting
- Authentication routes: 5 requests per 15 minutes
- Password reset: 3 requests per hour
- General API: Configurable limits per route

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "details": "Additional error information"
  }
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `423`: Account Locked
- `429`: Too Many Requests
- `500`: Internal Server Error

### Validation Errors
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    {
      "msg": "Email is required",
      "param": "email",
      "location": "body"
    }
  ]
}
```

## Authentication Endpoints

### User Registration
```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "dataProcessingConsent": {
    "given": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "healthDataConsent": {
    "given": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User created successfully. Please check your email to verify your account.",
  "user": {
    "id": "64f...",
    "email": "john.doe@example.com",
    "firstName": "John"
  }
}
```

### Email Verification
```http
POST /api/v1/auth/verify-email
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```

### User Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f...",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "user"
  }
}
```

### Get User Profile
```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Update User Profile
```http
PUT /api/v1/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "dob": "1990-01-01",
  "gender": "male",
  "phone": "+1234567890",
  "activityStatus": "active",
  "startWeight": 180,
  "currentWeight": 175,
  "goals": "Lose weight and build muscle",
  "reason": "Improve overall fitness"
}
```

### Password Reset
```http
POST /api/v1/auth/forgot-password
Content-Type: application/json

{
  "email": "john.doe@example.com"
}
```

```http
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-here",
  "password": "NewSecurePass123!"
}
```

### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

## Subscription Management

### Get Available Plans
```http
GET /api/v1/subscriptions/plans
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "1-month",
        "name": "1 Month",
        "amount": 2999,
        "displayPrice": "$29.99",
        "priceId": "price_123...",
        "productId": "prod_123..."
      }
    ]
  }
}
```

### Get Current Subscription
```http
GET /api/v1/subscriptions/user/current
Authorization: Bearer <token>
```

### Create Subscription
```http
POST /api/v1/subscriptions/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethodId": "pm_123...",
  "plan": "1-month"
}
```

### Cancel Subscription
```http
DELETE /api/v1/subscriptions/:subscriptionId/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "atPeriodEnd": false
}
```

### Get Subscription Invoices
```http
GET /api/v1/subscriptions/:subscriptionId/invoices
Authorization: Bearer <token>
```

### Get Payment Method
```http
GET /api/v1/subscriptions/:subscriptionId/payment-method
Authorization: Bearer <token>
```

## Workout Tracking

### Log Workout
```http
POST /api/v1/workouts/log
Authorization: Bearer <token>
Content-Type: application/json

{
  "workoutName": "Upper Body Strength",
  "date": "2024-01-15T10:00:00.000Z",
  "programId": "64f...",
  "exercises": [
    {
      "exerciseName": "Bench Press",
      "sets": [
        {
          "setNumber": 1,
          "reps": 10,
          "weight": 135,
          "rpe": 7,
          "completed": true
        }
      ]
    }
  ],
  "duration": 45,
  "notes": "Felt strong today"
}
```

### Get Workout Logs
```http
GET /api/v1/workouts?page=1&limit=20&sortOrder=desc
Authorization: Bearer <token>
```

### Get Single Workout
```http
GET /api/v1/workouts/:workoutId
Authorization: Bearer <token>
```

### Delete Workout
```http
DELETE /api/v1/workouts/:workoutId
Authorization: Bearer <token>
```

### Get Exercise Progress
```http
GET /api/v1/workouts/progress/Bench%20Press?limit=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "exerciseName": "Bench Press",
  "data": {
    "sessions": [
      {
        "date": "2024-01-15T10:00:00.000Z",
        "workoutName": "Upper Body Strength",
        "maxWeight": 135,
        "totalVolume": 1350,
        "sets": 4,
        "totalReps": 40
      }
    ],
    "maxWeight": 135,
    "totalSets": 4,
    "totalReps": 40,
    "averageVolume": 1350,
    "frequency": "2.50"
  }
}
```

### Get Workout Statistics
```http
GET /api/v1/workouts/stats/summary
Authorization: Bearer <token>
```

## Program Marketplace

### Get All Programs
```http
GET /api/v1/programs?search=strength&tags=beginner,strength
```

### Get Program Details
```http
GET /api/v1/programs/:programId
```

### Purchase Program
```http
POST /api/v1/programs/checkout
Authorization: Bearer <token>
Content-Type: application/json

{
  "programId": "64f..."
}
```

### Get User's Programs
```http
GET /api/v1/programs/user/my-programs
Authorization: Bearer <token>
```

### Check Program Access
```http
GET /api/v1/programs/user/access/:programSlug
Authorization: Bearer <token>
```

## Medical Documents

### Upload Document
```http
POST /api/v1/medical-documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <document-file>
```

### Get Documents
```http
GET /api/v1/medical-documents/get
Authorization: Bearer <token>
```

### Delete Document
```http
POST /api/v1/medical-documents/delete
Authorization: Bearer <token>
Content-Type: application/json

{
  "filename": "document.pdf"
}
```

### View Document
```http
GET /api/v1/medical-documents/view/:filename
Authorization: Bearer <token>
```

### Download Document
```http
GET /api/v1/medical-documents/download/:filename
Authorization: Bearer <token>
```

## Appointments

### Get Appointments
```http
GET /api/v1/appointments
Authorization: Bearer <token>
```

### Create Appointment
```http
POST /api/v1/appointments
Authorization: Bearer <token>
Content-Type: application/json

{
  "trainerId": "64f...",
  "date": "2024-01-20T14:00:00.000Z",
  "type": "consultation",
  "notes": "Initial consultation"
}
```

### Update Appointment
```http
PUT /api/v1/appointments/:appointmentId
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "confirmed",
  "notes": "Updated notes"
}
```

### Delete Appointment
```http
DELETE /api/v1/appointments/:appointmentId
Authorization: Bearer <token>
```

## Trainer Endpoints

### Get Trainer Dashboard
```http
GET /api/v1/trainer/dashboard
Authorization: Bearer <token>
```

### Get Trainer Clients
```http
GET /api/v1/trainer/clients
Authorization: Bearer <token>
```

### Get Trainer Appointments
```http
GET /api/v1/trainer/appointments
Authorization: Bearer <token>
```

### Get Client Details
```http
GET /api/v1/trainer/client/:clientId
Authorization: Bearer <token>
```

### Update Appointment
```http
PUT /api/v1/trainer/appointments/:appointmentId
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed",
  "notes": "Great session!"
}
```

## User Management (Admin)

### Get All Users
```http
GET /api/v1/users?role=user&page=1&limit=20
Authorization: Bearer <token>
```

### Get User Profile
```http
GET /api/v1/users/:userId
Authorization: Bearer <token>
```

### Update User
```http
PUT /api/v1/users/:userId
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Updated Name",
  "role": "trainer"
}
```

### Delete User
```http
DELETE /api/v1/users/:userId
Authorization: Bearer <token>
```

### Get User Data Export
```http
GET /api/v1/users/data-export
Authorization: Bearer <token>
```

### Delete User Data
```http
DELETE /api/v1/users/data-delete
Authorization: Bearer <token>
Content-Type: application/json

{
  "confirmation": "DELETE ALL MY DATA"
}
```

## GDPR Compliance

### Get Consent Status
```http
GET /api/v1/gdpr/consent
Authorization: Bearer <token>
```

### Update Data Processing Consent
```http
POST /api/v1/gdpr/consent/data-processing
Authorization: Bearer <token>
Content-Type: application/json

{
  "given": true
}
```

### Update Health Data Consent
```http
POST /api/v1/gdpr/consent/health-data
Authorization: Bearer <token>
Content-Type: application/json

{
  "given": true
}
```

### Update Marketing Consent
```http
POST /api/v1/gdpr/consent/marketing
Authorization: Bearer <token>
Content-Type: application/json

{
  "given": false
}
```

### Withdraw Consent
```http
DELETE /api/v1/gdpr/consent/:consentType
Authorization: Bearer <token>
```

### Request Data Access
```http
POST /api/v1/gdpr/data-access
Authorization: Bearer <token>
```

### Request Data Rectification
```http
PUT /api/v1/gdpr/data-rectification
Authorization: Bearer <token>
Content-Type: application/json

{
  "field": "email",
  "value": "newemail@example.com"
}
```

### Request Data Erasure
```http
DELETE /api/v1/gdpr/data-erasure
Authorization: Bearer <token>
```

### Request Data Portability
```http
POST /api/v1/gdpr/data-portability
Authorization: Bearer <token>
```

### Object to Processing
```http
POST /api/v1/gdpr/object-to-processing
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Personal reasons"
}
```

### Restrict Processing
```http
POST /api/v1/gdpr/restrict-processing
Authorization: Bearer <token>
Content-Type: application/json

{
  "restrict": true
}
```

### Get Audit Log
```http
GET /api/v1/gdpr/audit-log
Authorization: Bearer <token>
```

## Client Management (Admin)

### Get All Clients
```http
GET /api/v1/clients?page=1&limit=20&search=john&sortBy=name&sortOrder=asc
Authorization: Bearer <token>
```

### Get Client Details
```http
GET /api/v1/clients/:clientId
Authorization: Bearer <token>
```

### Get Client Statistics
```http
GET /api/v1/clients/statistics
Authorization: Bearer <token>
```

### Delete Client
```http
DELETE /api/v1/clients/:clientId
Authorization: Bearer <token>
```

## Logging and Monitoring

### Get Logs
```http
GET /api/v1/logs?page=1&limit=50&level=error&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

### Get Log Statistics
```http
GET /api/v1/logs/stats
Authorization: Bearer <token>
```

### Export Logs
```http
GET /api/v1/logs/export?format=csv&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

## Cache Management

### Get Cache Versions
```http
GET /api/v1/cache/cache-versions
```

### Get Cache Diagnostics
```http
GET /api/v1/cache/cache-diagnostics
```

## Products (Public)

### Get Products
```http
GET /api/v1/products
```

### Create Checkout Session
```http
POST /api/v1/products/checkout
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "productId": "64f...",
      "quantity": 1
    }
  ]
}
```

### Get Purchase History
```http
GET /api/v1/products/purchases
Authorization: Bearer <token>
```

## Webhooks

### Stripe Webhooks
```http
POST /webhooks/stripe
Content-Type: application/json
Stripe-Signature: <signature>

{
  "id": "evt_...",
  "object": "event",
  "type": "invoice.payment_succeeded",
  ...
}
```

## Data Models

### User Model
```javascript
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  email: String,
  password: String, // Hashed
  role: String, // 'user' | 'trainer' | 'admin'
  isEmailVerified: Boolean,
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  failedLoginAttempts: Number,
  lockoutUntil: Date,
  lastLoggedIn: Date,
  stripeCustomerId: String,
  subscriptionStatus: String,
  subscriptionPlan: String,
  billingEnvironment: String,
  dob: Date,
  gender: String,
  phone: String,
  activityStatus: String,
  startWeight: Number,
  currentWeight: Number,
  goals: String,
  reason: String,
  nutritionLogs: [{
    id: Number,
    date: String,
    mealType: String,
    foodItem: String,
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number
  }],
  schedule: Object,
  workoutLogs: [{
    workoutName: String,
    date: Date,
    programId: ObjectId,
    exercises: [{
      exerciseName: String,
      sets: [{
        setNumber: Number,
        reps: Number,
        weight: Number,
        rpe: Number,
        completed: Boolean
      }]
    }],
    duration: Number,
    notes: String,
    totalVolume: Number,
    deletedAt: Date
  }],
  purchasedPrograms: [{
    programId: ObjectId,
    purchasedAt: Date,
    amountPaid: Number
  }],
  dataProcessingConsent: {
    given: Boolean,
    timestamp: Date
  },
  healthDataConsent: {
    given: Boolean,
    timestamp: Date
  },
  marketingEmails: Boolean,
  dataAnalytics: Boolean,
  thirdPartySharing: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Subscription Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  plan: String, // '1-month', '3-month', '6-month', '12-month'
  stripePriceId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  status: String, // 'active', 'past_due', 'canceled', 'paused'
  amount: Number,
  currency: String,
  billingEnvironment: String,
  cancelAtPeriodEnd: Boolean,
  canceledAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Program Model
```javascript
{
  _id: ObjectId,
  title: String,
  slug: String,
  author: String,
  goals: String,
  description: String,
  tags: [String],
  difficulty: String, // 'beginner', 'intermediate', 'advanced'
  duration: String,
  imageUrl: String,
  features: [String],
  stripeProductId: String,
  stripePriceId: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Appointment Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  trainerId: ObjectId,
  date: Date,
  type: String, // 'consultation', 'follow-up', 'assessment'
  status: String, // 'pending', 'confirmed', 'completed', 'canceled'
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

## User Flows

### New User Registration Flow
1. User submits registration form
2. System validates input and creates user
3. OTP sent to email for verification
4. User verifies email with OTP
5. User can now login
6. Upon first login, Stripe customer is created
7. User can subscribe to plans

### Workout Logging Flow
1. User authenticates with JWT
2. User submits workout data
3. System validates workout structure
4. Workout is saved to user's profile
5. Volume calculations are performed
6. Progress tracking is updated

### Subscription Flow
1. User selects subscription plan
2. Stripe payment method is collected
3. Subscription is created in Stripe
4. Local subscription record is created
5. User gains access to premium features
6. Recurring billing is handled by Stripe webhooks

### Program Purchase Flow
1. User browses available programs
2. User initiates checkout for selected program
3. Stripe checkout session is created
4. User completes payment on Stripe
5. Webhook updates user's purchased programs
6. User gains access to program content

## Compliance Features

### GDPR Rights
- **Right to Access**: Users can export their data
- **Right to Rectification**: Users can update their information
- **Right to Erasure**: Users can delete their account and data
- **Right to Data Portability**: Users can download their data
- **Right to Object**: Users can object to data processing
- **Right to Restrict Processing**: Users can limit data processing

### HIPAA Compliance
- Health data is encrypted at rest and in transit
- Access to medical documents is logged
- Users must provide explicit consent for health data processing
- Data retention policies are enforced

### Security Measures
- All PII is encrypted
- Audit logs for sensitive operations
- Rate limiting on authentication endpoints
- Account lockout after failed attempts
- JWT tokens expire after 1 hour
- Password strength requirements

## Development and Testing

### Environment Variables
```bash
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/jefitness
JWT_SECRET=your-jwt-secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
MAILJET_API_KEY=your-mailjet-api-key
MAILJET_SECRET_KEY=your-mailjet-secret-key
FRONTEND_URL=http://localhost:5500
```

### Running Tests
```bash
npm test
```

### API Documentation Access
- Swagger UI: `http://localhost:5000/api-docs`
- OpenAPI JSON: `http://localhost:5000/api-docs.json`
- Redoc: `http://localhost:5000/redoc`

## Support

For API support or questions:
- Email: support@jefitness.com
- Documentation: https://jefitness.com/api-docs
- Status Page: https://status.jefitness.com

## Changelog

### Version 1.0.0
- Initial release with core fitness tracking features
- JWT authentication with role-based access
- Stripe subscription management
- Workout logging and progress tracking
- Program marketplace
- Medical document management
- Appointment scheduling
- GDPR/HIPAA compliance features
- Comprehensive logging and monitoring
