const mongoose = require('mongoose');
const { logger } = require('../src/services/logger');

const connectDB = async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        maxPoolSize: 20,                // Max connections in pool
        minPoolSize: 5,                 // Min connections to maintain
        maxIdleTimeMS: 30000,           // Close idle connections after 30s
        socketTimeoutMS: 45000,         // Socket timeout for operations
        retryWrites: true,              // Automatically retry writes
        retryReads: true,               // Automatically retry reads
      });
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      retries++;
      logger.error(`MongoDB connection attempt ${retries} failed`, { error: err.message });
      if (retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        logger.info(`Retrying MongoDB connection in ${delay}ms`, { retries });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  logger.error('Failed to connect to MongoDB after maximum retries');
  process.exit(1);
};

module.exports = connectDB;

