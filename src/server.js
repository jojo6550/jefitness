const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');

dotenv.config();

const app = express();

// Trust proxy for accurate IP identification (required for Render deployment)
app.set('trust proxy', 1);

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
        "https://cdnjs.cloudflare.com"
      ],
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
        "https://cdn.jsdelivr.net"
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
app.use(morgan('combined'));
app.use(express.json());
app.use(cors());

// Cache control middleware
const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

// Serve static files
app.use(express.static("public"));

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
connectDB();

// -----------------------------
// Rate Limiters
// -----------------------------
const { apiLimiter } = require('./middleware/rateLimiter');

// -----------------------------
// Routes
// -----------------------------
const auth = require('./middleware/auth');
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sleep', auth, apiLimiter, require('./routes/sleep'));
app.use('/api/clients', auth, apiLimiter, require('./routes/clients'));
app.use('/api/logs', auth, apiLimiter, require('./routes/logs'));
app.use('/api/appointments', auth, apiLimiter, require('./routes/appointments'));
app.use('/api/users', auth, apiLimiter, require('./routes/users'));
app.use('/api/nutrition', auth, apiLimiter, require('./routes/nutrition'));
app.use('/api/notifications', auth, apiLimiter, require('./routes/notifications'));
app.use('/api/programs', apiLimiter, require('./routes/programs'));
app.use('/api/cart', auth, apiLimiter, require('./routes/cart'));
app.use('/api/orders', auth, apiLimiter, require('./routes/orders'));
app.use('/api/medical-documents', auth, apiLimiter, require('./routes/medical-documents'));

// Serve frontend for SPA routes
app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// -----------------------------
// Error Handling Middleware
// -----------------------------
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message} | Stack: ${err.stack}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

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
// Start Server
// -----------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
