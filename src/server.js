const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const { logger, logError } = require('./services/logger');

dotenv.config();

const app = express();

// Trust proxy for accurate IP identification (required for Render deployment)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cors());

// Security headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // allow Bootstrap JS from CDN
        styleSrc: ["'self'", "'unsafe-inline'"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],  // allow Bootstrap CSS, Google Fonts, and Animate.css from CDN
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"], // allow Google Fonts
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// Serve static files from the 'public' directory
app.use(express.static('public'));

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
app.use('/api/sleep', apiLimiter, require('./routes/sleep'));
app.use('/api/clients', apiLimiter, require('./routes/clients'));
app.use('/api/logs', auth, apiLimiter, require('./routes/logs'));
app.use('/api/appointments', apiLimiter, require('./routes/appointments'));
app.use('/api/users', apiLimiter, require('./routes/users'));
app.use('/api/nutrition', apiLimiter, require('./routes/nutrition'));

// Basic test route
app.get('/', (req, res) => res.send('API Running'));

// Error handling middleware
app.use((err, req, res, next) => {
  logError(err, { context: 'Unhandled Server Error' });
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

// Import User model for cleanup job
const User = require('./models/User');

// Schedule cleanup job to run every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const result = await User.deleteMany({
      isEmailVerified: false,
      createdAt: { $lt: thirtyMinutesAgo }
    });

    if (result.deletedCount > 0) {
      logger.info(`Cleanup job: Deleted ${result.deletedCount} unverified accounts older than 30 minutes`);
    }
  } catch (err) {
    logError(err, { context: 'Unverified accounts cleanup job' });
  }
});

app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
