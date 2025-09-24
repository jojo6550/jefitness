const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const { logger, logError } = require('./services/logger');

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Cache control middleware to prevent caching of authenticated pages
const noCache = (req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
};

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

// Define Routes
// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sleep', require('./routes/sleep'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/users', require('./routes/users'));

// Serve authenticated pages with no-cache headers to prevent back button access
const authenticatedPages = [
    '/dashboard.html',
    '/pages/dashboard.html',
    '/pages/profile.html',
    '/pages/admin-dashboard.html',
    '/pages/sleep-tracker.html',
    '/pages/timer.html',
    '/pages/schedule.html',
    '/pages/view-statistics.html',
    '/pages/workout-programs.html',
    '/pages/meet-your-trainer.html'
];

authenticatedPages.forEach(page => {
    app.get(page, noCache, (req, res) => {
        res.sendFile(page, { root: 'public' });
    });
});

// Basic test route
app.get('/', (req, res) => res.send('API Running'));

// Error handling middleware
app.use((err, req, res, next) => {
    logError(err, { context: 'Unhandled Server Error' });
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});


const PORT = process.env.PORT || 10000;

app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
