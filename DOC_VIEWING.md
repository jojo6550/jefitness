# JE Fitness API Documentation Viewing Guide

This guide explains how to access and view all the API documentation for the JE Fitness application.

## Prerequisites

- The server must be running in development mode (`npm start`)
- NODE_ENV should not be set to 'production' (documentation is disabled in production for security)

## Available Documentation Types

### 1. Swagger UI (Interactive API Explorer)

**URL:** `http://localhost:10000/api-docs`

**Features:**
- Interactive API testing interface
- Try out API endpoints directly from the browser
- Request/response examples
- Authentication support
- Filter and search functionality

**How to use:**
1. Open `http://localhost:10000/api-docs` in your browser
2. Expand endpoints to see details
3. Click "Try it out" to test endpoints
4. Enter required parameters and click "Execute"

### 2. Redoc (Clean Documentation Viewer)

**URL:** `http://localhost:10000/redoc`

**Features:**
- Clean, readable documentation layout
- Mobile-friendly design
- Fast loading
- Print-friendly format
- No interactive testing (view-only)

**How to use:**
1. Open `http://localhost:10000/redoc` in your browser
2. Navigate through the API sections
3. Expand schemas and examples as needed

### 3. Raw OpenAPI JSON Specification

**URL:** `http://localhost:10000/api-docs.json`

**Features:**
- Complete OpenAPI 3.0 specification in JSON format
- Machine-readable format
- Can be imported into other tools
- Used by both Swagger UI and Redoc

**How to use:**
1. Open `http://localhost:10000/api-docs.json` in your browser or API client
2. Copy the JSON for use in other documentation tools
3. Validate against OpenAPI standards if needed

### 4. JSDoc Generated Documentation

**Location:** `./docs/` directory

**Features:**
- Code-level documentation for all JavaScript files
- Function signatures and descriptions
- Parameter and return type information
- Usage examples
- Cross-referenced code navigation

**How to generate:**
```bash
npm run docs:jsdoc
```

**How to view:**
1. Run `npm run docs:jsdoc` to generate/update documentation
2. Open `./docs/index.html` in your browser
3. Navigate through the codebase documentation

## API Endpoints Covered

The documentation includes all authentication and API endpoints:

- **Authentication:** `/api/v1/auth/*`
  - User registration and login
  - Profile management
  - Password reset
  - Email verification

- **Core Features:** `/api/v1/*`
  - User management
  - Nutrition tracking
  - Sleep logging
  - Appointments
  - Programs and cart
  - Notifications
  - Medical documents
  - Chat functionality
  - GDPR compliance

## Security Notes

- All documentation endpoints are only available in development mode
- In production (NODE_ENV=production), these routes return 404
- Authentication is required for most endpoints as indicated in the docs
- Rate limiting is applied to API endpoints

## Troubleshooting

**Documentation not loading:**
- Ensure server is running: `npm start`
- Check NODE_ENV is not set to 'production'
- Verify port 10000 is not in use

**Redoc not displaying:**
- Check browser console for CSP errors
- Ensure `https://unpkg.com` is allowed in Content Security Policy

**JSDoc not generating:**
- Ensure jsdoc package is installed
- Check jsdoc.json configuration
- Verify source files exist in specified directories

## Development Workflow

1. Make changes to route files with JSDoc/Swagger comments
2. Restart server to reload Swagger spec
3. Test endpoints in Swagger UI
4. Generate JSDoc: `npm run docs:jsdoc`
5. Review documentation in browser

## Additional Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Redoc Documentation](https://redocly.com/docs/redoc/)
- [JSDoc Documentation](https://jsdoc.app/)
