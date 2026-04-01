require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const cron = require('node-cron');
const helmet = require('helmet');
const cors = require('cors');

// API Docs
const swaggerUi = require('swagger-ui-express');
const redoc = require('redoc-express');

const connectDB = require('../config/db');

const swaggerSpec = require('./docs/swagger');

// Utilities, DB, and jobs
const { startSubscriptionCleanupJob } = require('./jobs');
const { logger } = require('./services/logger');
const {
  getFileHash,
  invalidateCache,
  startFileWatching,
  stopFileWatching,
} = require('./utils/cacheVersion');

// Middleware
const { requestLogger } = require('./middleware/requestLogger');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const csrfProtection = require('./middleware/csrf');
const { corsOptions } = require('./middleware/corsConfig');
const {
  requireDataProcessingConsent,
  requireHealthDataConsent,
  checkDataRestriction,
} = require('./middleware/consent');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { auth } = require('./middleware/auth');
const versioning = require('./middleware/versioning');
const { nonceMiddleware, helmetOptions } = require('./config/security');
const { getDbStatus, isDbConnected } = require('./middleware/dbConnection');

// Routers
const webhookRouter = require('./routes/webhooks');

// Models
const User = require('./models/User');

const PORT = process.env.PORT || 10000;
const app = express();

// -----------------------------
// App Config
// -----------------------------

app.set('trust proxy', 1);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));

// CORS
app.use(cors(corsOptions));

// Security middlewares
app.use(nonceMiddleware);
app.use(helmet(helmetOptions));

// Logging, sanitization, and CSRF
app.use(requestLogger);
app.use(sanitizeInput);
app.use(csrfProtection.middleware());

// Disable caching in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

// Custom cache control
const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// -----------------------------
// Webhooks
// -----------------------------
// Webhooks BEFORE body parsers for raw Stripe signature verification
// (CSRF bypassed via UA+sig check for root / misconfigs)
app.use(['/webhooks', '/webhook'], webhookRouter);

// -----------------------------
// Clean URL handler for frontend pages
// -----------------------------
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/webhook') ||
    req.path.startsWith('/api-docs') ||
    req.path.startsWith('/redoc')
  ) {
    return next();
  }

  const match = req.path.match(/^\/([\w-]+)$/);
  if (!match) return next();

  const filePath = path.join(__dirname, '..', 'public', 'pages', `${match[1]}.html`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }

  next();
});

// -----------------------------
// Health & CSRF
// -----------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: isDbConnected() ? 'healthy' : 'degraded',
    dbStatus: getDbStatus(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/v1/csrf-token', (req, res) => {
  res.json({ success: true, token: res.locals.csrfToken });
});

// -----------------------------
// API Routes
// -----------------------------
const apiRoutes = [
  ['/products', require('./routes/products')],
  ['/subscriptions', require('./routes/subscriptions')],
  ['/programs', require('./routes/programs')],
  ['/auth', require('./routes/auth')],
];

apiRoutes.forEach(([route, router]) => app.use(`/api/v1${route}`, versioning, router));

const protectedRoutes = [
  ['/clients', require('./routes/clients')],
  ['/logs', require('./routes/logs')],
  ['/appointments', require('./routes/appointments')],
  ['/users', require('./routes/users')],
  ['/medical-documents', require('./routes/medical-documents')],
  ['/trainer', require('./routes/trainer')],
  ['/gdpr', require('./routes/gdpr')],
  ['/workouts', require('./routes/workouts')],
];

protectedRoutes.forEach(([route, router]) => {
  const middlewares = [
    auth,
    requireDataProcessingConsent,
    checkDataRestriction,
    apiLimiter,
    versioning,
  ];
  if (['/logs', '/medical-documents', '/workouts'].includes(route)) {
    middlewares.splice(2, 0, requireHealthDataConsent); // Insert health consent where needed
  }
  app.use(`/api/v1${route}`, ...middlewares, router);
});

// -----------------------------
// Swagger & Redoc (Dev Only)
// -----------------------------
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get(
    '/redoc',
    redoc({ title: 'JE Fitness API Documentation', specUrl: '/api-docs.json' })
  );
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

// -----------------------------
// 404 Handler for APIs
// -----------------------------
app.use('/api', (req, res) =>
  res.status(404).json({ success: false, message: 'Endpoint not found' })
);

// -----------------------------
// Global Error Handler
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Cron Jobs
// -----------------------------
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  try {
    const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;
    const cutoff = new Date(Date.now() - cleanupTime * 60 * 1000);
    const result = await User.deleteMany({
      isEmailVerified: false,
      createdAt: { $lt: cutoff },
    });
    if (result.deletedCount > 0)
      logger.info(`Deleted ${result.deletedCount} unverified accounts`);
  } catch (err) {
    logger.error('Cleanup job failed', err);
  }
});

// -----------------------------
// Server Startup
// -----------------------------
async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected successfully');

    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', err => console.error('Mongo error', err));

    startSubscriptionCleanupJob();

    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    const gracefulShutdown = async signal => {
      console.log(`${signal} received. Shutting down.`);
      stopFileWatching();
      csrfProtection.stop();
      server.close(async () => {
        await mongoose.connection.close();
        console.log('MongoDB closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = app;
