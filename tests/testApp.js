const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { body } = require('express-validator');

// Import middleware
const auth = require('../src/middleware/auth');

// Import routes
const authRoutes = require('../src/routes/auth');
const programs = require('../src/routes/programs');
const users = require('../src/routes/users');
const subscriptions = require('../src/routes/subscriptions');

// Create test app
const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for testing
}));
app.use(express.json());
app.use(cors());

// Routes - use v1 prefix to match actual routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/programs', programs);
app.use('/api/v1/users', users);
app.use('/api/v1/subscriptions', subscriptions);

// Error handling
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

module.exports = app;
