require('dotenv').config();

// Initialize Passport strategies (no sessions — JWT-only)
require('./config/passport');

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const passport = require('passport');
const compression = require('compression');
const cron = require('node-cron');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// API Docs
const swaggerUi = require('swagger-ui-express');
const redoc = require('redoc-express');

const connectDB = require('../config/db');

const swaggerSpec = require('./docs/swagger');

// Utilities, DB, and jobs
const {
  startSubscriptionCleanupJob,
  startRenewalReminderJob,
  startTrainerDailyEmailJob,
  startTenMinuteReminderJob,
} = require('./jobs');
const { logger } = require('./services/logger');

// Middleware
const { requestLogger } = require('./middleware/requestLogger');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { preventNoSQLInjection } = require('./middleware/inputValidator');
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

// Validate critical environment variables at startup
function validateConfig() {
  const required = ['JWT_SECRET', 'MONGO_URI'];
  const paymentRequired = ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET'];

  const missingRequired = required.filter(key => !process.env[key]);
  const missingPayment = paymentRequired.filter(key => !process.env[key]);

  if (missingRequired.length > 0) {
    throw new Error(`Critical environment variables missing: ${missingRequired.join(', ')}`);
  }

  if (missingPayment.length > 0) {
    logger.warn('PayPal not fully configured', { missing: missingPayment });
  }
}

// -----------------------------
// App Config
// -----------------------------

app.set('trust proxy', 1);

// Webhooks MUST be registered BEFORE body parsers.
// The webhook router applies express.raw() internally so Stripe can verify
// the raw Buffer body for signature checking. If express.json() runs first,
// the body stream is already consumed and constructEvent() will always throw.
app.use(['/webhooks', '/webhook'], webhookRouter);

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: false }));
app.use(cookieParser());

// Compression (gzip/deflate)
app.use(compression());

// CORS
app.use(cors(corsOptions));

// Security middlewares
app.use(nonceMiddleware);
app.use(helmet(helmetOptions));

// Logging, sanitization, and security
app.use(requestLogger);
app.use(sanitizeInput);
app.use(preventNoSQLInjection); // Apply globally for defense-in-depth

app.use(passport.initialize());

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// -----------------------------
// Admin dashboard page (auth + admin role enforced inside the router)
// -----------------------------
app.use('/admin', require('./routes/admin'));
app.use('/api/v1/admin', require('./routes/admin-api'));
app.use('/api/v1/tickets', require('./routes/tickets'));

// Favicon route (fixes 404)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public/favicons/favicon.ico'));
});

// Static files
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// -----------------------------
// Clean URL handler for frontend pages
// -----------------------------
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/webhook') ||
    req.path.startsWith('/api-docs') ||
    req.path.startsWith('/redoc') ||
    req.path.startsWith('/admin')
  ) {
    return next();
  }

  // Match single-segment paths (/dashboard) and two-segment paths (/clients/:id)
  const match = req.path.match(/^\/([\w-]+)(?:\/([\w-]+))?$/);
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
app.get('/api/health', async (req, res) => {
  const checks = {
    db: isDbConnected(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  };

  try {
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET) {
      const paypalService = require('./services/paypal');
      const client = paypalService.getPaypalClient();
      checks.payment = !!client;
    } else {
      checks.payment = false;
    }
  } catch (err) {
    logger.warn('Payment provider health check failed', { error: err.message });
    checks.payment = false;
  }

  const allHealthy = checks.db && checks.payment;
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    dbStatus: getDbStatus(),
  });
});

app.get('/api/v1/nutrition/food-search', (req, res) => {
  const https = require('https');
  const query = String(req.query.q || '')
    .trim()
    .slice(0, 100);
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({
    query,
    dataType: 'Foundation,SR Legacy',
    pageSize: '8',
    api_key: apiKey,
  });
  const options = {
    hostname: 'api.nal.usda.gov',
    path: `/fdc/v1/foods/search?${params}`,
    headers: { Accept: 'application/json' },
  };

  https
    .get(options, upstream => {
      let body = '';
      upstream.on('data', chunk => {
        body += chunk;
      });
      upstream.on('end', () => {
        if (upstream.statusCode !== 200) {
          logger.warn(`USDA food search returned ${upstream.statusCode}`);
          return res.status(502).json({ error: 'Food search unavailable' });
        }
        try {
          const data = JSON.parse(body);
          // Normalise to { foods: [{ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g }] }
          const N = (nutrients, ...ids) => {
            for (const id of ids) {
              const n = nutrients.find(n => n.nutrientId === id);
              if (n?.value != null) return Math.round(n.value * 10) / 10;
            }
            return 0;
          };
          const foods = (data.foods || [])
            .map(f => ({
              name: f.description,
              kcalPer100g: N(f.foodNutrients, 2048, 2047, 1008),
              proteinPer100g: N(f.foodNutrients, 1003),
              carbsPer100g: N(f.foodNutrients, 1005),
              fatPer100g: N(f.foodNutrients, 1004),
            }))
            .filter(f => f.kcalPer100g > 0);
          res.json({ foods });
        } catch {
          res.status(502).json({ error: 'Invalid response from food API' });
        }
      });
    })
    .on('error', err => {
      logger.warn(`Food search proxy error: ${err.message}`);
      res.status(502).json({ error: 'Food search unavailable' });
    });
});

// -----------------------------
// API Routes
// -----------------------------
const apiRoutes = [
  ['/subscriptions', require('./routes/subscriptions')],
  ['/auth', require('./routes/auth')],
  ['/plans', require('./routes/plans')],
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
  ['/nutrition', require('./routes/nutrition')],
];

protectedRoutes.forEach(([route, router]) => {
  const middlewares = [
    auth,
    requireDataProcessingConsent,
    checkDataRestriction,
    apiLimiter,
    versioning,
  ];
  if (['/logs', '/medical-documents', '/workouts', '/nutrition'].includes(route)) {
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
let cleanupJobRunning = false;
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  if (cleanupJobRunning) {
    logger.warn('Cleanup job skipped — previous run still in progress');
    return;
  }
  cleanupJobRunning = true;
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
  } finally {
    cleanupJobRunning = false;
  }
});

// -----------------------------
// Server Startup
// -----------------------------
async function startServer() {
  try {
    // Validate critical config before connecting to anything
    validateConfig();
    logger.info('Configuration validated');

    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected successfully');

    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', err =>
      logger.error('MongoDB connection error', { error: err.message })
    );

    startSubscriptionCleanupJob();
    startRenewalReminderJob();
    startTrainerDailyEmailJob();
    startTenMinuteReminderJob();

    // Plans are now hardcoded in config/subscriptionConstants.js
    logger.info('STARTUP: Plans loaded from configuration');

    // Keep-alive pings for production (prevents sleep on free hosts like Render)
    if (process.env.NODE_ENV === 'production') {
      const pingUrl = `http://localhost:${PORT}/api/health`;
      setInterval(
        async () => {
          try {
            await fetch(pingUrl);
            // Also ping MongoDB to prevent connection from going cold
            await mongoose.connection.db.command({ ping: 1 });
            logger.info('Self-ping sent');
          } catch {
            // Silent fail - do not log errors
          }
        },
        10 * 60 * 1000
      ); // Every 10 minutes
    }

    const server = app.listen(PORT, () =>
      logger.info(`Server running on port ${PORT}`, { port: PORT })
    );

    const gracefulShutdown = async signal => {
      logger.info('Shutting down gracefully', { signal });

      const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
      const shutdownTimer = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, force exiting');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT);

      server.close(async () => {
        clearTimeout(shutdownTimer);
        try {
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');
        } catch (err) {
          logger.error('Error closing MongoDB connection', { error: err.message });
        }
        process.exit(0);
      });
    };

    // Unhandled exception handlers
    process.on('uncaughtException', err => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise: promise.toString() });
      process.exit(1);
    });

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = app;
