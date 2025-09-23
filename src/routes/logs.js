const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { adminLogger } = require('../services/logger');

// Middleware to ensure admin access
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Admin access required' });
    }
    next();
};

// Get logs with filtering and pagination
router.get('/', requireAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            level,
            category,
            startDate,
            endDate,
            search,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};

        if (level) {
            filter.level = level;
        }

        if (category) {
            filter.category = category;
        }

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) {
                filter.timestamp.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.timestamp.$lte = new Date(endDate);
            }
        }

        if (search) {
            filter.$or = [
                { message: { $regex: search, $options: 'i' } },
                { 'metadata.context': { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query
        const logs = await Log.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'firstName lastName email')
            .lean();

        // Get total count for pagination
        const total = await Log.countDocuments(filter);

        // Get log statistics
        const stats = await Log.getLogStats(
            startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate ? new Date(endDate) : new Date()
        );

        res.json({
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limitNum),
                totalLogs: total,
                hasNext: skip + logs.length < total,
                hasPrev: parseInt(page) > 1
            },
            stats: stats || []
        });

        adminLogger.info(`Admin ${req.user.id} retrieved logs`, {
            meta: {
                filters: { level, category, startDate, endDate, search },
                pagination: { page, limit },
                total
            }
        });

    } catch (err) {
        adminLogger.error('Error retrieving logs', {
            meta: { error: err.message, stack: err.stack }
        });
        res.status(500).json({ msg: 'Server error while retrieving logs' });
    }
});

// Get log statistics
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'level' } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        let stats;
        if (groupBy === 'category') {
            stats = await Log.aggregate([
                { $match: { timestamp: { $gte: start, $lte: end } } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
        } else {
            stats = await Log.aggregate([
                { $match: { timestamp: { $gte: start, $lte: end } } },
                { $group: { _id: '$level', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
        }

        res.json(stats);

    } catch (err) {
        adminLogger.error('Error retrieving log statistics', {
            meta: { error: err.message, stack: err.stack }
        });
        res.status(500).json({ msg: 'Server error while retrieving log statistics' });
    }
});

// Get logs for a specific user
router.get('/user/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const logs = await Log.find({ userId })
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Log.countDocuments({ userId });

        res.json({
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limitNum),
                totalLogs: total
            }
        });

    } catch (err) {
        adminLogger.error('Error retrieving user logs', {
            meta: { error: err.message, stack: err.stack, userId: req.params.userId }
        });
        res.status(500).json({ msg: 'Server error while retrieving user logs' });
    }
});

// Clean old logs (admin only)
router.delete('/cleanup', requireAdmin, async (req, res) => {
    try {
        const { daysToKeep = 30 } = req.body;

        const result = await Log.cleanOldLogs(daysToKeep);

        adminLogger.info(`Admin ${req.user.id} cleaned up old logs`, {
            meta: { daysToKeep, deletedCount: result.deletedCount }
        });

        res.json({
            msg: 'Old logs cleaned up successfully',
            deletedCount: result.deletedCount
        });

    } catch (err) {
        adminLogger.error('Error cleaning up logs', {
            meta: { error: err.message, stack: err.stack }
        });
        res.status(500).json({ msg: 'Server error while cleaning up logs' });
    }
});

// Export logs to CSV
router.get('/export', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, level, category } = req.query;

        const filter = {};
        if (level) filter.level = level;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        const logs = await Log.find(filter)
            .sort({ timestamp: -1 })
            .populate('userId', 'firstName lastName email')
            .lean();

        // Convert to CSV
        const csvHeaders = ['Timestamp', 'Level', 'Category', 'Message', 'User', 'IP', 'User Agent'];
        const csvRows = logs.map(log => [
            log.timestamp,
            log.level,
            log.category,
            `"${log.message.replace(/"/g, '""')}"`,
            log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : '',
            log.ip || '',
            log.userAgent || ''
        ]);

        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

        adminLogger.info(`Admin ${req.user.id} exported logs to CSV`, {
            meta: { logCount: logs.length, filters: { level, category, startDate, endDate } }
        });

    } catch (err) {
        adminLogger.error('Error exporting logs', {
            meta: { error: err.message, stack: err.stack }
        });
        res.status(500).json({ msg: 'Server error while exporting logs' });
    }
});

module.exports = router;
