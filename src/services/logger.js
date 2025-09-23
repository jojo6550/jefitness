const winston = require('winston');
const path = require('path');
const Log = require('../models/Log');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define colors for different log levels
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Define format for logs
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.json(),
);

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom MongoDB transport
class MongoDBTransport extends winston.Transport {
    constructor(opts) {
        super(opts);
        this.name = 'mongodb';
        this.level = opts.level || 'info';
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Save to MongoDB asynchronously
        const logEntry = {
            timestamp: new Date(info.timestamp),
            level: info.level,
            category: this.getCategoryFromLogger(info),
            message: info.message,
            metadata: info.meta || {},
            stack: info.stack || null
        };

        // Only save to MongoDB if not in test environment
        if (process.env.NODE_ENV !== 'test') {
            Log.create(logEntry).catch(err => {
                console.error('Failed to save log to MongoDB:', err);
            });
        }

        callback();
    }

    getCategoryFromLogger(info) {
        // Determine category based on logger type or message content
        if (info.message && info.message.includes('[ADMIN]')) return 'admin';
        if (info.message && info.message.includes('[USER]')) return 'user';
        if (info.message && info.message.includes('[SECURITY]')) return 'security';
        if (info.message && info.message.includes('auth')) return 'auth';
        return 'general';
    }
}

// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        format: format,
        level: process.env.LOG_LEVEL || 'info',
    }),

    // Error log file
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: fileFormat,
    }),

    // Combined log file
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: fileFormat,
    }),

    // MongoDB transport
    new MongoDBTransport({
        level: process.env.LOG_LEVEL || 'info',
    }),
];

// Create the logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format,
    transports,
});

// Create admin-specific logger
const adminLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(
            (info) => `${info.timestamp} [ADMIN] ${info.level}: ${info.message}`,
        ),
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.colorize({ all: true }),
                winston.format.printf(
                    (info) => `${info.timestamp} [ADMIN] ${info.level}: ${info.message}`,
                ),
            ),
            level: process.env.LOG_LEVEL || 'info',
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'admin.log'),
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.json(),
            ),
        }),
    ],
});

// Create user-specific logger
const userLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(
            (info) => `${info.timestamp} [USER] ${info.level}: ${info.message}`,
        ),
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.colorize({ all: true }),
                winston.format.printf(
                    (info) => `${info.timestamp} [USER] ${info.level}: ${info.message}`,
                ),
            ),
            level: process.env.LOG_LEVEL || 'info',
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'user.log'),
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.json(),
            ),
        }),
    ],
});

// Create security logger for authentication and authorization events
const securityLogger = winston.createLogger({
    level: 'info',
    levels,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(
            (info) => `${info.timestamp} [SECURITY] ${info.level}: ${info.message}`,
        ),
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.colorize({ all: true }),
                winston.format.printf(
                    (info) => `${info.timestamp} [SECURITY] ${info.level}: ${info.message}`,
                ),
            ),
            level: 'info',
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'security.log'),
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
                winston.format.json(),
            ),
        }),
    ],
});

// Helper functions for structured logging
const logAdminAction = (action, userId, details = {}) => {
    adminLogger.info(`Admin action: ${action} | User ID: ${userId} | Details: ${JSON.stringify(details)}`);
};

const logUserAction = (action, userId, details = {}) => {
    userLogger.info(`User action: ${action} | User ID: ${userId} | Details: ${JSON.stringify(details)}`);
};

const logSecurityEvent = (event, userId, details = {}) => {
    securityLogger.info(`Security event: ${event} | User ID: ${userId} | Details: ${JSON.stringify(details)}`);
};

const logError = (error, context = {}) => {
    logger.error(`Error: ${error.message} | Context: ${JSON.stringify(context)} | Stack: ${error.stack}`);
};

module.exports = {
    logger,
    adminLogger,
    userLogger,
    securityLogger,
    logAdminAction,
    logUserAction,
    logSecurityEvent,
    logError,
};
