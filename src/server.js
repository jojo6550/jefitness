const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const { logger, logError } = require('./services/logger');

dotenv.config();

const app = express();

// Trust proxy for accurate IP identification (required for Render deployment)
app.set('trust proxy', 1);

// Configure CSP with Helmet (added to fix external resource loading issues)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],  // Restrict to same origin by default
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],  // Allows Bootstrap CSS and inline styles
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "'sha256-782Awk1qhdoOGWnR+DkncgQKVcjsQlHt0ojtKE4PwMw='"],  // Allows Bootstrap JS and inline script hash
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],  // Allows connections for source maps and other resources
      imgSrc: ["'self'", "data:", "https://via.placeholder.com"],  // Allows images from self, data URIs, and placeholder service
    },
  },
}));

// Middleware
app.use(express.json());
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB Connected successfully');
  } catch (err) {
    logError(err, { context: 'MongoDB Connection' });
    process.exit(1);
  }
};
connectDB();

// Import rate limiters
const { apiLimiter } = require('./middleware/rateLimiter');

const PORT = process.env.PORT || 10000;

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

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logError(err, { context: 'Unhandled Server Error' });
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

// Import User model for cleanup job
const User = require('./models/User');

// Schedule cleanup job to run every 30 minutes
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  try {
    const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;
    const thirtyMinutesAgo = new Date(Date.now() - cleanupTime * 60 * 1000);
    const result = await User.deleteMany({
      isEmailVerified: false,
      createdAt: { $lt: thirtyMinutesAgo }
    });

    if (result.deletedCount > 0) {
      logger.info(`Cleanup job: Deleted ${result.deletedCount} unverified accounts older than ${cleanupTime} minutes`);
    }
  } catch (err) {
    logError(err, { context: 'Unverified accounts cleanup job' });
  }
});

app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
