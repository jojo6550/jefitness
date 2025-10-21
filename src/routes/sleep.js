const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { logger } = require('../services/logger');

// Helper function to sort sleep logs
function sortSleepLogs(logs, sortBy, order) {
  return logs.sort((a, b) => {
    if (sortBy === 'date') {
      return order === 'desc' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date);
    } else if (sortBy === 'hoursSlept') {
      return order === 'desc' ? b.hoursSlept - a.hoursSlept : a.hoursSlept - b.hoursSlept;
    }
    return 0;
  });
}

// GET /sleep - get all sleep logs with optional search and sorting
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let sleepLogs = user.sleepLogs || [];

    // Search by date (exact match or date range)
    if (req.query.date) {
      const searchDate = new Date(req.query.date);
      sleepLogs = sleepLogs.filter(log => new Date(log.date).toDateString() === searchDate.toDateString());
    }

    // Sort by date or hoursSlept
    const sortBy = req.query.sortBy || 'date';
    const order = req.query.order || 'desc';
    sleepLogs = sortSleepLogs(sleepLogs, sortBy, order);

    res.json(sleepLogs);
  } catch (err) {
    logger.error('Error retrieving sleep logs', { error: err.message, stack: err.stack, userId: req.user?.id, query: req.query });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /sleep - add a new sleep log
router.post('/', auth, async (req, res) => {
  try {
    const { date, hoursSlept } = req.body;
    if (!date || hoursSlept == null) {
      return res.status(400).json({ message: 'Date and hoursSlept are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Initialize sleepLogs if it doesn't exist (for backward compatibility)
    if (!user.sleepLogs) {
      user.sleepLogs = [];
    }

    // Check if a log for the date already exists
    const existingLogIndex = user.sleepLogs.findIndex(log => new Date(log.date).toDateString() === new Date(date).toDateString());
    if (existingLogIndex !== -1) {
      // Update existing log
      user.sleepLogs[existingLogIndex].hoursSlept = hoursSlept;
    } else {
      // Add new log
      user.sleepLogs.push({ date, hoursSlept });
    }

    await user.save();
    res.status(201).json(user.sleepLogs);
  } catch (err) {
    logger.error('Error adding/updating sleep log', { error: err.message, stack: err.stack, userId: req.user?.id, body: req.body });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /sleep/:id - update a sleep log by id
router.put('/:id', auth, async (req, res) => {
  try {
    const { date, hoursSlept } = req.body;
    const logId = req.params.id;

    if (!date || hoursSlept == null) {
      return res.status(400).json({ message: 'Date and hoursSlept are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Initialize sleepLogs if it doesn't exist (for backward compatibility)
    if (!user.sleepLogs) {
      user.sleepLogs = [];
    }

    const log = user.sleepLogs.id(logId);
    if (!log) return res.status(404).json({ message: 'Sleep log not found' });

    log.date = date;
    log.hoursSlept = hoursSlept;

    await user.save();
    res.json(log);
  } catch (err) {
    logger.error('Error updating sleep log', { error: err.message, stack: err.stack, userId: req.user?.id, logId: req.params.id, body: req.body });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /sleep/:id - delete a sleep log by id
router.delete('/:id', auth, async (req, res) => {
  try {
    const logId = req.params.id;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Initialize sleepLogs if it doesn't exist (for backward compatibility)
    if (!user.sleepLogs) {
      user.sleepLogs = [];
    }

    const log = user.sleepLogs.id(logId);
    if (!log) return res.status(404).json({ message: 'Sleep log not found' });

    log.remove();
    await user.save();
    res.json({ message: 'Sleep log deleted' });
  } catch (err) {
    logger.error('Error deleting sleep log', { error: err.message, stack: err.stack, userId: req.user?.id, logId: req.params.id });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
