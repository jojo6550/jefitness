const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');


// API Documentation imports
const swaggerUi = require('swagger-ui-express');
const redoc = require('redoc-express');
const swaggerSpec = require('./docs/swagger');

dotenv.config();

const PORT = process.env.PORT;

const app = express();

// Initialize cache service
const cacheService = require('./services/cache');
cacheService.connect();

// Trust proxy for accurate IP identification (required for Render deployment)
app.set('trust proxy', 1);

// Import security middleware
const securityHeaders = require('./middleware/securityHeaders');
const { corsOptions } = require('./middleware/corsConfig');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction } = require('./middleware/consent');

// -----------------------------
// Enhanced Security Headers with Helmet
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
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net"
      ],
      connectSrc: [
        "'self'",
        "https://api.mailjet.com",
        "https://cdn.jsdelivr.net",
        "https://api.stripe.com"
      ],
      frameSrc: [
        "'self'",
        "https://js.stripe.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://via.placeholder.com",
        "https://cdn.jsdelivr.net"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
      blockAllMixedContent: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" }
}));

// -----------------------------
// Middleware
// -----------------------------
// Request logging
app.use(requestLogger);

// Security headers
app.use(securityHeaders);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));

// Input sanitization
app.use(sanitizeInput);

// CORS with enhanced security
app.use(cors(corsOptions));

// Global OPTIONS handler for preflight requests
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

// Disable caching in development for all routes
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

// Cache control middleware
const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

// Cache version utility
const { getFileHash, invalidateCache, startFileWatching, stopFileWatching } = require('./utils/cacheVersion');

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

    mongoose.set('debug', (collectionName, method, query, doc) => {
      const start = Date.now();
      setImmediate(() => {
        const duration = Date.now() - start;
        if (duration > 100) {
          console.log(`Slow Query: ${collectionName}.${method} took ${duration}ms - Query: ${JSON.stringify(query)}`);
        }
      });
    });

    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));

  } catch (err) {
    console.error(`Error: ${JSON.stringify(err)} | Context: MongoDB Connection`);
    process.exit(1);
  }
};
if (process.env.NODE_ENV !== 'test') {
  connectDB();
  invalidateCache();
}

// -----------------------------
// Rate Limiters
// -----------------------------
const { apiLimiter } = require('./middleware/rateLimiter');

// -----------------------------
// Health Check Endpoint
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
// Cache Management Routes
// -----------------------------
app.use('/api', require('./routes/cache'));

// -----------------------------
// Routes with API Versioning
// -----------------------------
const { auth } = require('./middleware/auth');
const versioning = require('./middleware/versioning');

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

// API Documentation routes (only in development)
if (process.env.NODE_ENV !== 'production') {
  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true
    }
  }));

  // Redoc
  app.get('/redoc', redoc({
    title: 'JE Fitness API Documentation',
    specUrl: '/api-docs.json',
    redocOptions: {
      theme: {
        colors: {
          primary: {
            main: '#007bff'
          }
        }
      }
    }
  }));

  // Raw OpenAPI JSON spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// Backward compatibility - redirect old routes to v1
// Handle OPTIONS requests for CORS preflight before redirect
app.options('/api/auth', cors(corsOptions));
app.options('/api/v1/auth', cors(corsOptions));
app.use('/api/auth', (req, res, next) => {
  res.redirect(307, '/api/v1/auth' + req.path);
});

app.use('/api/clients', (req, res, next) => {
  res.redirect(307, '/api/v1/clients' + req.path);
});
app.use('/api/logs', (req, res, next) => {
  res.redirect(307, '/api/v1/logs' + req.path);
});
app.use('/api/appointments', (req, res, next) => {
  res.redirect(307, '/api/v1/appointments' + req.path);
});
app.use('/api/users', (req, res, next) => {
  res.redirect(307, '/api/v1/users' + req.path);
});

app.use('/api/notifications', (req, res, next) => {
  res.redirect(307, '/api/v1/notifications' + req.path);
});
app.use('/api/medical-documents', (req, res, next) => {
  res.redirect(307, '/api/v1/medical-documents' + req.path);
});
app.use('/api/trainer', (req, res, next) => {
  res.redirect(307, '/api/v1/trainer' + req.path);
});
app.use('/api/users', (req, res, next) => {
  res.redirect(307, '/api/v1/users' + req.path);
});

// 404 handler for API routes (after all routes and redirects)
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      path: req.path,
      method: req.method
    }
  });
});

// Serve frontend for SPA routes (non-API routes only)
app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// -----------------------------
// Global Error Handling Middleware
// MUST be last middleware in the chain
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Cleanup Job (Unverified Users)
// -----------------------------
const User = require('./models/User');
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;
      const thirtyMinutesAgo = new Date(Date.now() - cleanupTime * 60 * 1000);
      const result = await User.deleteMany({
        isEmailVerified: false,
        createdAt: { $lt: thirtyMinutesAgo }
      });

      if (result.deletedCount > 0) {
        console.log(`Cleanup job: Deleted ${result.deletedCount} unverified accounts older than ${cleanupTime} minutes`);
      }
      break;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Cleanup job failed after ${attempt} attempts: ${err.stack}`);
      } else {
        console.warn(`Cleanup attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }
});

// -----------------------------
// Backup and Archiving Jobs
// -----------------------------
cron.schedule('0 2 * * *', () => {
  console.log('Starting daily database backup...');
  const { exec } = require('child_process');
  exec('node scripts/backup.js', (error, stdout, stderr) => {
    if (error) console.error(`Backup failed: ${error.message}`);
    if (stderr) console.error(`Backup stderr: ${stderr}`);
    console.log(`Backup completed: ${stdout}`);
  });
});

cron.schedule('0 3 1 * *', () => {
  console.log('Starting monthly data archiving...');
  const { exec } = require('child_process');
  exec('node scripts/archive.js', (error, stdout, stderr) => {
    if (error) console.error(`Archiving failed: ${error.message}`);
    if (stderr) console.error(`Archiving stderr: ${stderr}`);
    console.log(`Archiving completed: ${stdout}`);
  });
});

// -----------------------------
// GDPR/HIPAA Compliance Jobs
// -----------------------------
cron.schedule('0 1 1 */6 *', async () => {
  console.log('Starting bi-annual data retention cleanup...');
  try {
    const complianceService = require('./services/compliance');
    const result = await complianceService.performDataRetentionCleanup();
    console.log('Data retention cleanup completed:', result);
  } catch (error) {
    console.error('Data retention cleanup failed:', error.message);
  }
});

// -----------------------------
// Memory Monitoring and Cleanup
// -----------------------------
const monitoringService = require('./services/monitoring');

// Periodic memory monitoring and cleanup (every 10 minutes)
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  console.log(`Memory usage: ${memUsagePercent.toFixed(2)}% (${Math.round(memUsage.heapUsed / 1024 / 1024)} MB used)`);

  // Trigger cleanup if memory usage is high
  if (memUsagePercent > 85) {
    console.log('High memory usage detected, triggering cleanup...');
    monitoringService.performMemoryCleanup();
  }
}, 10 * 60 * 1000); // 10 minutes

// Only start server if this file is run directly (not required in tests)
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    stopFileWatching();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    stopFileWatching();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

module.exports = app;
