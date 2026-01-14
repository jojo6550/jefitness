const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');

// API Documentation
const swaggerUi = require('swagger-ui-express');
const redoc = require('redoc-express');
const swaggerSpec = require('./docs/swagger');

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

// -----------------------------
// Initialize services
// -----------------------------
const cacheService = require('./services/cache');
cacheService.connect();

const monitoringService = require('./services/monitoring');

// -----------------------------
// Security & Middleware
// -----------------------------
const securityHeaders = require('./middleware/securityHeaders');
const { corsOptions } = require('./middleware/corsConfig');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction } = require('./middleware/consent');
const { requireActiveSubscription } = require('./middleware/subscriptionAuth');
const { apiLimiter } = require('./middleware/rateLimiter');
const versioning = require('./middleware/versioning');
const cacheControl = require('./middleware/cacheControl');

app.set('trust proxy', 1); // needed for Render deployment

// -----------------------------
// Helmet & Security
// -----------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
        "https://js.stripe.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://api.mailjet.com", "https://cdn.jsdelivr.net", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https://via.placeholder.com", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
      blockAllMixedContent: []
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" }
}));

// -----------------------------
// Standard Middleware
// -----------------------------
app.use(requestLogger);
app.use(securityHeaders);
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));
app.use(sanitizeInput);
app.use(cors(corsOptions));
app.use(cacheControl);

// Global OPTIONS handler for preflight
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(200);
    return;
  }
  next();
});

// Disable caching in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// -----------------------------
// MongoDB Connection
// -----------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      family: 4
    });
    console.log('MongoDB Connected successfully');

    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));

    mongoose.set('debug', (collection, method, query) => {
      const start = Date.now();
      setImmediate(() => {
        const duration = Date.now() - start;
        if (duration > 100) console.log(`Slow Query: ${collection}.${method} took ${duration}ms - Query: ${JSON.stringify(query)}`);
      });
    });
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};
if (process.env.NODE_ENV !== 'test') connectDB();

// -----------------------------
// Health Check
// -----------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// -----------------------------
// API Routes
// -----------------------------
const { auth } = require('./middleware/auth');

app.use('/api/v1/auth', versioning, require('./routes/auth'));
app.use('/api/v1/clients', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/clients'));
app.use('/api/v1/logs', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/logs'));
app.use('/api/v1/appointments', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/appointments'));
app.use('/api/v1/users', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/users'));
app.use('/api/v1/notifications', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/notifications'));
app.use('/api/v1/medical-documents', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/medical-documents'));
app.use('/api/v1/trainer', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/trainer'));
app.use('/api/v1/gdpr', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/gdpr'));
app.use('/api/v1/subscriptions', apiLimiter, versioning, require('./routes/subscriptions'));
app.use('/api/v1/cart', auth, apiLimiter, versioning, require('./routes/cart'));
app.use('/api/v1/checkout', auth, apiLimiter, versioning, require('./routes/checkout'));
app.use('/api/v1/products', auth, apiLimiter, versioning, require('./routes/products'));
app.use('/webhooks', require('./routes/webhooks'));

// -----------------------------
// Swagger / Redoc (dev only)
// -----------------------------
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true, swaggerOptions: { docExpansion: 'none', filter: true, showRequestDuration: true } }));
  app.get('/redoc', redoc({ title: 'JE Fitness API', specUrl: '/api-docs.json' }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

// -----------------------------
// API 404 handler
// -----------------------------
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'API endpoint not found', path: req.path, method: req.method }
  });
});

// -----------------------------
// SPA fallback
// -----------------------------
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ success: false, error: { message: 'Endpoint not found', path: req.path } });
  }
});

// -----------------------------
// Global Error Handler
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Cron Jobs: Cleanup, Backup, Archiving, Compliance
// -----------------------------
const User = require('./models/User');

// Cleanup unverified users
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  const maxRetries = 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;
      const threshold = new Date(Date.now() - cleanupTime * 60 * 1000);
      const result = await User.deleteMany({ isEmailVerified: false, createdAt: { $lt: threshold } });
      if (result.deletedCount > 0) console.log(`Deleted ${result.deletedCount} unverified accounts older than ${cleanupTime} minutes`);
      break;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) console.error(`Cleanup failed after ${attempt} attempts:`, err.stack);
      else {
        console.warn(`Cleanup attempt ${attempt} failed, retrying...`);
        await new Promise(res => setTimeout(res, attempt * 2000));
      }
    }
  }
});

// Backup, Archiving, Compliance jobs
cron.schedule('0 2 * * *', () => require('child_process').exec('node scripts/backup.js', (e, stdout, stderr) => { if (e) console.error(e); if (stderr) console.error(stderr); console.log(stdout); }));
cron.schedule('0 3 1 * *', () => require('child_process').exec('node scripts/archive.js', (e, stdout, stderr) => { if (e) console.error(e); if (stderr) console.error(stderr); console.log(stdout); }));
cron.schedule('0 1 1 */6 *', async () => { try { const complianceService = require('./services/compliance'); console.log(await complianceService.performDataRetentionCleanup()); } catch (err) { console.error(err); } });

// -----------------------------
// Memory monitoring
// -----------------------------
setInterval(() => {
  const mem = process.memoryUsage();
  const percent = (mem.heapUsed / mem.heapTotal) * 100;
  console.log(`Memory usage: ${percent.toFixed(2)}%`);
  if (percent > 85) monitoringService.performMemoryCleanup();
}, 10 * 60 * 1000);

// -----------------------------
// Start Server
// -----------------------------
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  const gracefulShutdown = () => {
    console.log('Shutting down gracefully...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

module.exports = app;
