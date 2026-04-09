const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger');

// All log routes require admin (auth already applied by server.js when mounting this router)
router.use(requireAdmin);

// Helper to validate and parse a date param, returns null if invalid
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/v1/logs
 * Query MongoDB Log collection with filters.
 * Query params:
 *   level      - comma-separated: error,warn,info,debug,http
 *   category   - comma-separated: general,admin,user,security,auth
 *   search     - regex on message field
 *   from       - ISO date string (start of range)
 *   to         - ISO date string (end of range)
 *   page       - default 1
 *   limit      - default 50, max 200
 *   live       - if 'true', use `after` param
 *   after      - ISO date string; return only entries newer than this
 */
router.get('/', async (req, res) => {
  try {
    const {
      level,
      category,
      search,
      from,
      to,
      page = 1,
      limit = 50,
      live,
      after,
    } = req.query;

    const query = {};

    // Level filter (comma-separated)
    if (level) {
      const levels = level.split(',').map((l) => l.trim()).filter(Boolean);
      if (levels.length === 1) query.level = levels[0];
      else if (levels.length > 1) query.level = { $in: levels };
    }

    // Category filter (comma-separated)
    if (category) {
      const cats = category.split(',').map((c) => c.trim()).filter(Boolean);
      if (cats.length === 1) query.category = cats[0];
      else if (cats.length > 1) query.category = { $in: cats };
    }

    // Search filter (regex on message — escape input to prevent ReDoS)
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.message = { $regex: escaped, $options: 'i' };
    }

    // Time range
    if (live === 'true' && after) {
      const afterDate = parseDate(after);
      if (after && !afterDate) return res.status(400).json({ msg: 'Invalid date parameter' });
      if (afterDate) query.timestamp = { $gt: afterDate };
    } else {
      const fromDate = parseDate(from);
      const toDate = parseDate(to);
      if (from && !fromDate) return res.status(400).json({ msg: 'Invalid date parameter' });
      if (to && !toDate) return res.status(400).json({ msg: 'Invalid date parameter' });
      const timeFilter = {};
      if (fromDate) timeFilter.$gte = fromDate;
      if (toDate) timeFilter.$lte = toDate;
      if (Object.keys(timeFilter).length > 0) query.timestamp = timeFilter;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    if (live === 'true') {
      // Live mode: just return newest entries, no pagination
      const logs = await Log.find(query)
        .sort({ timestamp: -1 })
        .limit(limitNum)
        .lean();
      return res.json({ logs: logs.reverse(), live: true });
    }

    const [logs, total] = await Promise.all([
      Log.find(query).sort({ timestamp: -1 }).skip(skip).limit(limitNum).lean(),
      Log.countDocuments(query),
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch logs', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/v1/logs/stats
 * Returns log counts by level and category for a time window.
 * Query params: from, to (ISO date strings; defaults to last 24 hours)
 */
router.get('/stats', async (req, res) => {
  try {
    const toDate = parseDate(req.query.to);
    const fromDate = parseDate(req.query.from);
    if (req.query.to && !toDate) return res.status(400).json({ msg: 'Invalid date parameter' });
    if (req.query.from && !fromDate) return res.status(400).json({ msg: 'Invalid date parameter' });
    const to = toDate || new Date();
    const from = fromDate || new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const stats = await Log.getLogStats(from, to);

    // getLogStats returns array from aggregation pipeline; reshape for frontend
    const byLevel = {};
    const byCategory = {};
    let total = 0;

    stats.forEach((entry) => {
      if (entry._id && entry._id.level) {
        byLevel[entry._id.level] = (byLevel[entry._id.level] || 0) + entry.count;
      }
      if (entry._id && entry._id.category) {
        byCategory[entry._id.category] = (byCategory[entry._id.category] || 0) + entry.count;
      }
      total += entry.count || 0;
    });

    // Recent errors (last 10)
    const recentErrors = await Log.find({ level: 'error', timestamp: { $gte: from, $lte: to } })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    res.json({ total, byLevel, byCategory, recentErrors });
  } catch (err) {
    logger.error('Failed to fetch log stats', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch log stats' });
  }
});

/**
 * GET /api/v1/logs/export
 * Download logs as CSV. Applies same filters as GET /logs.
 */
router.get('/export', async (req, res) => {
  try {
    const { level, category, search, from, to } = req.query;

    const query = {};
    if (level) {
      const levels = level.split(',').map((l) => l.trim()).filter(Boolean);
      query.level = levels.length === 1 ? levels[0] : { $in: levels };
    }
    if (category) {
      const cats = category.split(',').map((c) => c.trim()).filter(Boolean);
      query.category = cats.length === 1 ? cats[0] : { $in: cats };
    }
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.message = { $regex: escaped, $options: 'i' };
    }
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (from && !fromDate) return res.status(400).json({ msg: 'Invalid date parameter' });
    if (to && !toDate) return res.status(400).json({ msg: 'Invalid date parameter' });
    const timeFilter = {};
    if (fromDate) timeFilter.$gte = fromDate;
    if (toDate) timeFilter.$lte = toDate;
    if (Object.keys(timeFilter).length > 0) query.timestamp = timeFilter;

    const logs = await Log.find(query).sort({ timestamp: -1 }).limit(5000).lean();

    const csvHeader = 'Timestamp,Level,Category,Message,UserId,IP,Action\n';
    const csvRows = logs
      .map((log) => {
        const ts = new Date(log.timestamp).toISOString();
        const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
          escape(ts),
          escape(log.level),
          escape(log.category),
          escape(log.message),
          escape(log.userId || ''),
          escape(log.ip || ''),
          escape(log.action || ''),
        ].join(',');
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
    res.send(csvHeader + csvRows);
  } catch (err) {
    logger.error('Failed to export logs', { error: err.message });
    res.status(500).json({ msg: 'Failed to export logs' });
  }
});

module.exports = router;
