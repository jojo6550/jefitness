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

// Create test app
const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for testing
}));
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programs);
app.use('/api/users', users);

// Error handling
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});

module.exports = app;
