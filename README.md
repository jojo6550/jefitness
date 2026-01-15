# JE Fitness Platform

A comprehensive fitness management platform built with Node.js, Express, MongoDB, and Stripe integration. Version 1.1.0 introduces enhanced Payment and Products features.

## Overview

JE Fitness is a full-stack web application designed for fitness centers and personal trainers to manage clients, appointments, subscriptions, and product sales. The platform includes role-based access control for admins, trainers, and clients, with robust security, compliance, and payment processing capabilities.

## Features

### 🔐 User Authentication & Authorization
- User registration and login with email verification
- JWT-based authentication with secure token management
- Role-based access control (Admin, Trainer, Client)
- Password reset functionality
- Secure logout with token blacklisting

### 💳 Subscription Management
- Flexible subscription plans (1-month, 3-month, 6-month, 12-month)
- Stripe-powered payment processing
- Automatic billing and invoice generation
- Subscription cancellation (immediate or end-of-period)
- Real-time subscription status tracking
- Billing history and invoice downloads

### 🛒 Product Sales & E-commerce
- Product catalog with dynamic pricing from Stripe
- Secure checkout sessions with Stripe
- Purchase history tracking
- Inventory management (via Stripe products)
- Automated order fulfillment

### 📅 Appointment Booking System
- Online appointment scheduling with trainers
- Time slot management (5:00 AM - 1:00 PM, hourly slots)
- Capacity limits (max 6 clients per time slot)
- One appointment per day per client restriction
- Appointment status management (scheduled, completed, cancelled, no_show, late)
- Real-time availability checking

### 📋 Medical Document Management
- Secure upload and storage of medical documents
- HIPAA-compliant data handling
- Document access control and sharing
- File type validation and size limits

### 🛡️ GDPR & Compliance
- Data processing consent management
- Health data consent tracking
- Automated data retention policies
- User data export and deletion requests
- Comprehensive audit logging
- Bi-annual compliance cleanup jobs

### 👨‍💼 Admin Dashboard
- User management (view, edit, deactivate accounts)
- Appointment oversight and management
- System logs and audit trails
- Notification management
- Compliance monitoring
- System health monitoring

### 🏋️‍♂️ Trainer Dashboard
- Client management and profiles
- Appointment scheduling and management
- Client progress tracking
- Communication tools

### 👤 Client Dashboard
- Personal profile management
- Subscription and billing overview
- Appointment booking and history
- Product purchase history
- Medical document access

### 📱 Mobile Support
- Capacitor-based mobile app support (Android/iOS)
- Responsive web design with Tailwind CSS
- Progressive Web App (PWA) capabilities

### 🔧 System Features
- **Security**: Helmet headers, rate limiting, CORS, input sanitization, encryption
- **Caching**: In-memory caching with version control and invalidation
- **Monitoring**: Memory usage monitoring, performance logging
- **Notifications**: Push notifications and email alerts
- **API Documentation**: Swagger UI and Redoc integration
- **Testing**: Comprehensive unit, integration, and frontend test suites
- **Maintenance**: Automated cleanup jobs, backups, and migrations

### 📚 Fitness Programs
- Pre-built program templates (8-week EDS safe strength, 9-week phased program, etc.)
- Program pages with detailed instructions
- Static content management

## Installation

### Prerequisites
- Node.js 16+
- MongoDB 4.4+
- Stripe account for payment processing
- Mailjet account for email services

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/jojo6550/jojo6550.github.io.git
   cd jojo6550.github.io
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```
   Configure the following variables:
   - `MONGO_URI`: MongoDB connection string
   - `JWT_SECRET`: JWT signing secret
   - `STRIPE_SECRET_KEY`: Stripe secret key
   - `STRIPE_PUBLISHABLE_KEY`: Stripe publishable key
   - `MAILJET_API_KEY`: Mailjet API key
   - `MAILJET_SECRET_KEY`: Mailjet secret key

4. Start the development server:
   ```bash
   npm run dev
   ```

5. For full development (backend + frontend):
   ```bash
   npm run dev:full
   ```

## Usage

### Development
- Backend API: `http://localhost:3000` (default port)
- Frontend: `http://localhost:5501` (BrowserSync)
- API Documentation: `http://localhost:3000/api-docs`

### Production
```bash
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:frontend
```

### Scripts
- `npm run cache:bust`: Clear application cache
- `npm run docs:jsdoc`: Generate JSDoc documentation
- `npm run build:css`: Build Tailwind CSS

## API Documentation

The API is fully documented with Swagger and Redoc:

- **Swagger UI**: `/api-docs`
- **Redoc**: `/redoc`
- **OpenAPI JSON**: `/api-docs.json`

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/verify-email` - Email verification
- `POST /api/v1/auth/forgot-password` - Password reset request

#### Subscriptions
- `GET /api/v1/subscriptions/plans` - Get available plans
- `POST /api/v1/subscriptions/create` - Create subscription
- `DELETE /api/v1/subscriptions/:id/cancel` - Cancel subscription
- `GET /api/v1/subscriptions/user/current` - Get user's subscription

#### Products
- `GET /api/v1/products` - Get product catalog
- `POST /api/v1/products/checkout` - Create checkout session
- `GET /api/v1/products/purchases` - Get purchase history

#### Appointments
- `GET /api/v1/appointments/user` - Get user's appointments
- `POST /api/v1/appointments` - Book appointment
- `PUT /api/v1/appointments/:id` - Update appointment
- `DELETE /api/v1/appointments/:id` - Cancel appointment

## Deployment

### Environment Variables
Configure the following for production:
- `NODE_ENV=production`
- `PORT=3000`
- Database and Stripe credentials
- Email service credentials
- Security secrets

### Docker Support
The application includes Docker support for containerized deployment.

### Mobile App
Build mobile apps using Capacitor:
```bash
npx cap add android
npx cap add ios
npx cap sync
```

## Security

- **Data Encryption**: Sensitive data encrypted using mongoose-encryption
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive input sanitization and validation
- **CORS**: Configured cross-origin resource sharing
- **Helmet**: Security headers for XSS protection and content security policy
- **Audit Logging**: All user actions and admin activities logged

## Compliance

- **GDPR**: Full compliance with data protection regulations
- **HIPAA**: Health data handling compliant with healthcare privacy laws
- **Data Retention**: Automated cleanup of expired data
- **Consent Management**: Explicit user consent tracking for data processing

## Testing

The platform includes comprehensive testing:
- **Unit Tests**: Individual component testing
- **Integration Tests**: API endpoint testing
- **Frontend Tests**: UI component testing with JSDOM
- **Coverage Reports**: Detailed test coverage analysis

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Version

**Current Version: 1.1.0**

### Changelog
- **1.1.0**: Enhanced Payment and Products features
  - Improved Stripe integration for subscriptions and products
  - Enhanced product catalog management
  - Streamlined checkout process
  - Better purchase history tracking

- **1.0.1**: Initial release with core features

## Roadmap

### Coming Soon: Program Marketplace 🏪
- **Third-party Program Integration**: Allow external trainers and programs to be listed
- **Program Purchases**: Buy and access premium fitness programs
- **Trainer Marketplace**: Connect with certified trainers worldwide
- **Revenue Sharing**: Commission-based model for marketplace transactions
- **Program Reviews**: User ratings and feedback system
- **Advanced Filtering**: Search and filter programs by category, difficulty, duration

### Future Enhancements
- Advanced analytics and reporting
- Mobile app enhancements
- AI-powered workout recommendations
- Social features and community building
- Integration with fitness wearables

---

For more information, visit the [API Documentation](/api-docs) or contact the development team.
