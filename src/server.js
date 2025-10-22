const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { logger, logError } = require('./services/logger');

dotenv.config();

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'sha256-0IqLuRSbwQOEA0Qqhtck6wOhKlo7B4SscfX0ePP4zX8='", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
})); // Security headers with custom CSP
app.use(express.json());
app.use(cors());

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

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'JE Fitness API',
            version: '1.0.0',
            description: 'API documentation for JE Fitness application',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
    if (res.headersSent) {
        return next(err);
    }
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
