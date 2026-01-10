# JE Fitness API Documentation

## Overview
JE Fitness is a comprehensive fitness management platform that provides APIs for user authentication, nutrition tracking, appointment scheduling, and more.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env` file in the root directory with the following variables:
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
MAILJET_API_KEY=your_mailjet_api_key
MAILJET_SECRET_KEY=your_mailjet_secret_key
FRONTEND_URL=your_frontend_url
NODE_ENV=development
```

### Running the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Documentation

The API documentation is available through multiple interfaces when running in development mode (`NODE_ENV !== 'production'`).

### Accessing API Documentation

#### 1. Swagger UI (Interactive Documentation)
- **URL**: `http://localhost:5000/api-docs`
- **Features**:
  - Interactive API testing
  - Request/response examples
  - Authentication support
  - Real-time request duration

#### 2. Redoc (Clean Documentation)
- **URL**: `http://localhost:5000/redoc`
- **Features**:
  - Mobile-friendly interface
  - Clean, professional layout
  - JE Fitness branded theme
  - Easy navigation

#### 3. OpenAPI JSON Specification
- **URL**: `http://localhost:5000/api-docs.json`
- **Features**:
  - Raw OpenAPI 3.0 specification
  - Machine-readable format
  - Can be imported into other tools

### API Versions
All endpoints are versioned under `/api/v1/`. Legacy routes under `/api/` are automatically redirected to v1.

### Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Rate Limiting
API endpoints are protected with rate limiting to prevent abuse.

## Available Endpoints

### Authentication
- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/auth/me` - Get user profile
- `PUT /api/v1/auth/profile` - Update user profile
- `POST /api/v1/auth/verify-email` - Email verification
- `POST /api/v1/auth/forgot-password` - Password reset request
- `POST /api/v1/auth/reset-password` - Password reset

### Nutrition Tracking
- `GET /api/v1/auth/nutrition` - Get nutrition logs
- `POST /api/v1/auth/nutrition` - Add nutrition log
- `DELETE /api/v1/auth/nutrition/:id` - Delete nutrition log

### Appointments
- `GET /api/v1/appointments` - Get appointments
- `POST /api/v1/appointments` - Create appointment
- `PUT /api/v1/appointments/:id` - Update appointment
- `DELETE /api/v1/appointments/:id` - Delete appointment

### Programs
- `GET /api/v1/programs` - Get fitness programs
- `POST /api/v1/programs` - Create program (Admin only)
- `PUT /api/v1/programs/:id` - Update program (Admin only)
- `DELETE /api/v1/programs/:id` - Delete program (Admin only)

### Chat
- `GET /api/v1/chat/messages` - Get chat messages
- `POST /api/v1/chat/messages` - Send message
- `PUT /api/v1/chat/messages/:id/read` - Mark message as read

### And more...

## JSDoc Documentation

Generate comprehensive code documentation using JSDoc:

```bash
npm run docs:jsdoc
```

This will generate HTML documentation in the `docs/` directory based on JSDoc comments in the source code.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
```

## Development Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run dev:frontend` - Start frontend development server
- `npm run dev:full` - Start both backend and frontend servers
- `npm run build:css` - Build Tailwind CSS
- `npm run seed:programs` - Seed database with sample programs

## Security Features

- JWT authentication
- Rate limiting
- Input sanitization
- CORS protection
- Helmet security headers
- GDPR/HIPAA compliance
- Data encryption
- Account lockout protection

## Compliance

The application implements GDPR and HIPAA compliance features including:
- Data retention policies
- User consent management
- Data anonymization
- Audit logging
- Secure data handling

## WebSocket Support

Real-time chat functionality is available via WebSocket connections for user-trainer and user-admin communications.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the ISC License.
