require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');
const fs = require('fs');
const { spawn } = require('child_process');

// API Documentation imports
const swaggerUi = require('swagger-ui-express');
const redoc = require('redoc-express');
const swaggerSpec = require('./docs/swagger');

const { startSubscriptionCleanupJob } = require('./jobs');

const PORT = process.env.PORT || 10000;

const app = express();

// WEBHOOKS
const webhookRouter = require('./routes/webhooks');
app.use('/webhooks', webhookRouter);
app.use('/webhook', webhookRouter);

// Trust proxy for Render
app.set('trust proxy', 1);

// Security config
const { nonceMiddleware, helmetOptions } = require('./config/security');

const connectDB = require('../config/db');

// Logger
const logger = require('./services/logger').logger;

// Middleware imports
const { requestLogger } = require('./middleware/requestLogger');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const csrfProtection = require('./middleware/csrf');
const { corsOptions } = require('./middleware/corsConfig');
const { requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction } = require('./middleware/consent');
const { errorHandler } = require('./middleware/errorHandler');

// Body parsing (required before CORS)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));

// CORS - MUST be early, before CSRF/sanitization for proper preflight handling
app.use(cors(corsOptions));

// Security middlewares (nonce, helmet after CORS)
app.use(nonceMiddleware);
app.use(helmet(helmetOptions));

app.use(requestLogger);

// Sanitization & CSRF (after CORS)
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

const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

const { getFileHash, invalidateCache, startFileWatching, stopFileWatching } = require('./utils/cacheVersion');

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Clean URL handler for frontend pages (AFTER static, BEFORE errorHandler)
app.use((req, res, next) => {
  // Skip API routes and docs
  if (req.path.match(/^\/api/) || 
      req.path === '/webhooks' || 
      req.path === '/webhook' || 
      req.path.match(/^\/api-docs/) ||
      req.path.match(/^\/redoc/)) {
    return next();
  }
  
  // Match clean page URLs: alphanumeric, hyphen, underscore only
  const pageMatch = req.path.match(/^\/([\w-]+)$/);
  if (!pageMatch) return next();
  
  const pageName = pageMatch[1];
  const htmlPath = path.join(__dirname, '..', 'public', 'pages', `${pageName}.html`);
  
  // Security: check file exists and prevent traversal
  if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
    return res.sendFile(htmlPath);
  }
  
  next();
});

// Rate limiter
const { apiLimiter } = require('./middleware/rateLimiter');

// Health check with DB status
const { getDbStatus, isDbConnected } = require('./middleware/dbConnection');
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: isDbConnected() ? 'healthy' : 'degraded',
    dbStatus: getDbStatus(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// CSRF endpoint
app.get('/api/v1/csrf-token', (req, res) => {
  res.json({
    success: true,
    token: res.locals.csrfToken
  });
});

// Auth middleware
const { auth } = require('./middleware/auth');

// Versioning
const versioning = require('./middleware/versioning');

// Routes
app.use('/api/v1/products', versioning, require('./routes/products'));
app.use('/api/v1/subscriptions', versioning, require('./routes/subscriptions'));
app.use('/api/v1/programs', versioning, require('./routes/programs'));
app.use('/api/v1/auth', versioning, require('./routes/auth'));

app.use('/api/v1/clients', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/clients'));
app.use('/api/v1/logs', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/logs'));
app.use('/api/v1/appointments', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/appointments'));
app.use('/api/v1/users', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/users'));
app.use('/api/v1/medical-documents', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/medical-documents'));
app.use('/api/v1/trainer', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/trainer'));
app.use('/api/v1/gdpr', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/gdpr'));
app.use('/api/v1/workouts', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/workouts'));

// Swagger docs
if (process.env.NODE_ENV !== 'production') {

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.get('/redoc', redoc({
    title: 'JE Fitness API Documentation',
    specUrl: '/api-docs.json'
  }));

  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}

// 404 API
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// -----------------------------
// Global Error Handler
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Cron Jobs
// -----------------------------

const User = require('./models/User');

cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {

  try {

    const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;

    const cutoff = new Date(Date.now() - cleanupTime * 60 * 1000);

    const result = await User.deleteMany({
      isEmailVerified: false,
      createdAt: { $lt: cutoff }
    });

    if (result.deletedCount > 0) {
      logger.info(`Deleted ${result.deletedCount} unverified accounts`);
    }

  } catch (err) {

    logger.error("Cleanup job failed", err);

  }

});

// -----------------------------
// Backup jobs
// -----------------------------

function runScript(scriptPath, label) {

  console.log(`Starting ${label}...`);

  const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit' });

  child.on('close', code => {

    if (code !== 0) console.error(`${label} failed`);

    else console.log(`${label} complete`);

  });

}

cron.schedule('0 2 * * *', () => runScript('scripts/backup.js', 'Daily backup'));

cron.schedule('0 3 1 * *', () => runScript('scripts/archive.js', 'Monthly archive'));

// -----------------------------
// Server Startup
// -----------------------------

async function startServer() {

  try {

    console.log("Connecting to MongoDB with retries...");
    
    await connectDB();

    console.log("✅ MongoDB connected successfully via connectDB");

    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

    mongoose.connection.on('error', err => console.error('Mongo error', err));

    // Start background jobs AFTER DB
    startSubscriptionCleanupJob();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    const gracefulShutdown = async (signal) => {

      console.log(`${signal} received. Shutting down.`);

      stopFileWatching();

      csrfProtection.stop();

      server.close(async () => {

        await mongoose.connection.close();

        console.log("MongoDB closed");

        process.exit(0);

      });

    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

  }

  catch (err) {

    console.error("Failed to start server:", err);

    process.exit(1);

  }

}

if (require.main === module) {

  startServer();

}

module.exports = app;