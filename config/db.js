const mongoose = require('mongoose');
const { logger } = require('../src/services/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected successfully');
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

module.exports = connectDB;
