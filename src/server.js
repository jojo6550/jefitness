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

// Configure CSP with Helmet (added to fix external resource loading issues)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],  // Restrict to same origin by default
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],  // Allows Bootstrap CSS, inline styles, and Google Fonts
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "'sha256-782Awk1qhdoOGWnR+DkncgQKVcjsQlHt0ojtKE4PwMw='"],  // Allows Bootstrap JS and inline scripts
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],  // Allows connections for source maps and other resources
      imgSrc: ["'self'", "data:", "https://via.placeholder.com"],  // Allows images from self, data URIs, and placeholder service
    },
  },
}));

// Middleware
app.use(morgan('combined'));
app.use(express.json());
app.use(cors());

// Import and use cache control middleware
const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      family: 4 // Use IPv4, skip trying IPv6
    });
    console.log('MongoDB Connected successfully');

    // Enable slow query logging
    mongoose.set('debug', (collectionName, method, query, doc) => {
      const start = Date.now();
      setImmediate(() => {
        const duration = Date.now() - start;
        if (duration > 100) { // Log queries slower than 100ms
          console.log(`Slow Query: ${collectionName}.${method} took ${duration}ms - Query: ${JSON.stringify(query)}`);
        }
      });
    });

    // Basic monitoring hooks
    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));

  } catch (err) {
    console.error(`Error: ${JSON.stringify(err)} | Context: MongoDB Connection`);
    process.exit(1);
  }
};
connectDB();

// Import rate limiters
const { apiLimiter } = require('./middleware/rateLimiter');

const PORT = 10000;

// Define Routes
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

// Serve frontend
app.use((req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message} | Context: Unhandled Server Error | Stack: ${err.stack}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

// Import User model for cleanup job
const User = require('./models/User');

// Schedule cleanup job to run every 30 minutes
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
      break; // Success, exit retry loop
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Error: ${err.message} | Context: Unverified accounts cleanup job | Stack: ${err.stack} | Attempts: ${attempt}`);
      } else {
        console.warn(`Cleanup job failed (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 2} seconds... Error: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // Exponential backoff
      }
    }
  }
});

// Schedule daily backup at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Starting daily database backup...');
  const { exec } = require('child_process');
  exec('node scripts/backup.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup failed: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Backup stderr: ${stderr}`);
    }
    console.log(`Backup completed: ${stdout}`);
  });
});

// Schedule monthly archiving on the 1st at 3 AM
cron.schedule('0 3 1 * *', async () => {
  console.log('Starting monthly data archiving...');
  const { exec } = require('child_process');
  exec('node scripts/archive.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Archiving failed: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Archiving stderr: ${stderr}`);
    }
    console.log(`Archiving completed: ${stdout}`);
  });
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
