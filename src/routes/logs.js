const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// In-memory storage for real-time logs
let realtimeLogs = [];
const MAX_LOGS = 500; // Reduced from 1000 to 500 for memory efficiency
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  if (realtimeLogs.length > MAX_LOGS) {
    const removedCount = realtimeLogs.length - MAX_LOGS;
    realtimeLogs = realtimeLogs.slice(-MAX_LOGS);
    console.log(`Log cleanup: Removed ${removedCount} old log entries`);
  }
}, CLEANUP_INTERVAL);

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  const message = args.join(' ');
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'app',
    message: message,
    user: null,
    ip: null,
    userAgent: null
  };
  realtimeLogs.push(logEntry);
  if (realtimeLogs.length > MAX_LOGS) {
    realtimeLogs = realtimeLogs.slice(-MAX_LOGS);
  }
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    category: 'error',
    message: message,
    user: null,
    ip: null,
    userAgent: null
  };
  realtimeLogs.push(logEntry);
  if (realtimeLogs.length > MAX_LOGS) {
    realtimeLogs = realtimeLogs.slice(-MAX_LOGS);
  }
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    category: 'warn',
    message: message,
    user: null,
    ip: null,
    userAgent: null
  };
  realtimeLogs.unshift(logEntry);
  if (realtimeLogs.length > MAX_LOGS) {
    realtimeLogs = realtimeLogs.slice(0, MAX_LOGS);
  }
  originalConsoleWarn.apply(console, args);
};

// GET /api/logs - Get logs with pagination and filtering
router.get('/', auth, (req, res) => {
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
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/logs/stats - Get log statistics
router.get('/stats', auth, (req, res) => {
  try {
    const stats = {
      total: realtimeLogs.length,
      byLevel: {},
      byCategory: {},
      recentErrors: realtimeLogs.filter(log => log.level === 'error').slice(0, 10)
    };

    realtimeLogs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/logs/export - Export logs as CSV
router.get('/export', auth, (req, res) => {
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
    const csvContent = exportLogs.map(log =>
      `"${log.timestamp}","${log.level}","${log.category}","${log.message.replace(/"/g, '""')}","${log.user || ''}","${log.ip || ''}","${log.userAgent || ''}"`
    ).join('\n');

    const csv = csvHeaders + csvContent;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Attach realtimeLogs to router for testing
router.realtimeLogs = realtimeLogs;

module.exports = router;
