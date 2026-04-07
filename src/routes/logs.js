/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: Real-time application log viewer, stats, and CSV export
 */

const express = require('express');
const router = express.Router();
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

// In-memory storage for real-time logs
let realtimeLogs = [];
const MAX_LOGS = 500; // Reduced from 1000 to 500 for memory efficiency
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  if (realtimeLogs.length > MAX_LOGS) {
    const removedCount = realtimeLogs.length - MAX_LOGS;
    realtimeLogs = realtimeLogs.slice(-MAX_LOGS);
    originalConsoleLog(`Log cleanup: Removed ${removedCount} old log entries`);
  }
}, CLEANUP_INTERVAL);

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const timezone = require('../utils/timezone');

// Helper function to add log entry
const addLogEntry = (level, category, message) => {
  const logEntry = {
    timestamp: timezone.getJamaicanISOString(),
    level,
    category,
    message,
    user: null,
    ip: null,
    userAgent: null,
  };
  realtimeLogs.push(logEntry);
  // Keep only the last MAX_LOGS entries
  if (realtimeLogs.length > MAX_LOGS) {
    realtimeLogs = realtimeLogs.slice(-MAX_LOGS);
  }
};

// Override console methods to capture logs
console.log = function (...args) {
  const message = args.join(' ');
  addLogEntry('info', 'app', message);
  originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
  const message = args.join(' ');
  addLogEntry('error', 'error', message);
  originalConsoleError.apply(console, args);
};

console.warn = function (...args) {
  const message = args.join(' ');
  addLogEntry('warn', 'warn', message);
  originalConsoleWarn.apply(console, args);
};

/**
 * @swagger
 * /logs:
 *   get:
 *     summary: Get in-memory application logs with pagination and filtering
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error]
 *         description: Filter by log level
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by log category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search in log messages
 *     responses:
 *       200:
 *         description: Paginated log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       level:
 *                         type: string
 *                       category:
 *                         type: string
 *                       message:
 *                         type: string
 *                 pagination:
 *                   type: object
 *       500:
 *         description: Server error
 */
// GET /api/logs - Get logs with pagination and filtering
// Auth is applied at router level in server.js
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    const category = req.query.category;
    const search = req.query.search;

    let filteredLogs = [...realtimeLogs];

    // Apply filters
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category);
    }
    if (search) {
      filteredLogs = filteredLogs.filter(log =>
        log.message.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Pagination
    const totalLogs = filteredLogs.length;
    const totalPages = Math.ceil(totalLogs / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalLogs: totalLogs,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    originalConsoleError('Error fetching logs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @swagger
 * /logs/stats:
 *   get:
 *     summary: Get log statistics (counts by level and category, recent errors)
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Log statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byLevel:
 *                   type: object
 *                 byCategory:
 *                   type: object
 *                 recentErrors:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Server error
 */
// GET /api/logs/stats - Get log statistics
router.get('/stats', (req, res) => {
  try {
    const stats = {
      total: realtimeLogs.length,
      byLevel: {},
      byCategory: {},
      recentErrors: realtimeLogs.filter(log => log.level === 'error').slice(0, 10),
    };

    realtimeLogs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    res.json(stats);
  } catch (error) {
    originalConsoleError('Error fetching log stats:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @swagger
 * /logs/export:
 *   get:
 *     summary: Export logs as a CSV file
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv: {}
 *       500:
 *         description: Server error
 */
// GET /api/logs/export - Export logs as CSV
router.get('/export', (req, res) => {
  try {
    const level = req.query.level;
    const category = req.query.category;

    let exportLogs = [...realtimeLogs];

    if (level) {
      exportLogs = exportLogs.filter(log => log.level === level);
    }
    if (category) {
      exportLogs = exportLogs.filter(log => log.category === category);
    }

    // Create CSV content
    const csvHeaders = 'Timestamp,Level,Category,Message,User,IP,User Agent\n';
    const csvContent = exportLogs
      .map(
        log =>
          `"${log.timestamp}","${log.level}","${log.category}","${log.message.replace(/"/g, '""')}","${log.user || ''}","${log.ip || ''}","${log.userAgent || ''}"`
      )
      .join('\n');

    const csv = csvHeaders + csvContent;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
    res.send(csv);
  } catch (error) {
    originalConsoleError('Error exporting logs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Attach realtimeLogs to router for testing (as a getter to always return current logs)
Object.defineProperty(router, 'realtimeLogs', {
  get() {
    return realtimeLogs;
  },
  set(value) {
    realtimeLogs = value;
  },
});

module.exports = router;
