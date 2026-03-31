// routes/clients.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

// GET /api/clients - return all users with search, filter, sort, and pagination
// Auth is applied at router level in server.js
router.get('/', async (req, res) => {
  try {
    // Optionally, restrict to admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const {
      search = '',
      status = '',
      sortBy = 'firstName',
      sortOrder = 'asc',
      page = 1,
      limit = 10,
    } = req.query;

    // Build search query
    const searchQuery = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    // Build status filter
    const statusQuery = status ? { activityStatus: status } : {};

    // Combine queries (exclude admins)
    const query = { ...searchQuery, ...statusQuery, role: { $ne: 'admin' } };

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalCount = await User.countDocuments(query);

    // Get clients with pagination and sorting (case-insensitive for string fields)
    const clients = await User.find(query)
      .select('-password')
      .collation({ locale: 'en', strength: 2 })
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      clients,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalClients: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/clients/statistics - return comprehensive client statistics
router.get('/statistics', async (req, res) => {
  try {
    // Optionally, restrict to admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // Use MongoDB aggregation to calculate statistics in the database (fixes N+1 query)
    const statistics = await User.aggregate([
      // Match all non-admin users
      {
        $match: { role: { $ne: 'admin' } },
      },
      // Group all documents and calculate counts using $cond for activityStatus
      {
        $group: {
          _id: null,
          totalClients: { $sum: 1 },
          activeClients: {
            $sum: { $cond: [{ $eq: ['$activityStatus', 'active'] }, 1, 0] },
          },
          inactiveClients: {
            $sum: { $cond: [{ $eq: ['$activityStatus', 'inactive'] }, 1, 0] },
          },
          onBreakClients: {
            $sum: { $cond: [{ $eq: ['$activityStatus', 'on-break'] }, 1, 0] },
          },
        },
      },
    ]);

    // Extract statistics from aggregation result (default to 0 if no clients found)
    const stats = statistics[0] || {
      totalClients: 0,
      activeClients: 0,
      inactiveClients: 0,
      onBreakClients: 0,
    };

    // Note: nutritionLogs and sleepLogs fields are not present in the User model
    // If these fields are added in the future, they can be calculated via aggregation
    // For now, return null/0 for these metrics
    res.json({
      totalClients: stats.totalClients,
      activeClients: stats.activeClients,
      inactiveClients: stats.inactiveClients,
      onBreakClients: stats.onBreakClients,
      avgCalories: 0,
      avgSleep: '0.0',
      topPerformers: {
        topCalorieBurner: null,
        bestSleeper: null,
        mostActive: stats.activeClients > 0 ? { name: 'N/A' } : null,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/clients/:id - get detailed info for a specific client
router.get('/:id', async (req, res) => {
  try {
    // Optionally, restrict to admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const client = await User.findById(req.params.id).select('-password');
    if (!client) {
      return res.status(404).json({ msg: 'Client not found' });
    }

    res.json({ client });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/clients/:id - delete a client
router.delete('/:id', async (req, res) => {
  try {
    // Optionally, restrict to admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const client = await User.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ msg: 'Client not found' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Client deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
