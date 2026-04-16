/**
 * @swagger
 * tags:
 *   name: Clients
 *   description: Admin-only client management (list, statistics, view, delete)
 */

// routes/clients.js
const express = require('express');

const router = express.Router();
const { logger } = require('../services/logger');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

/**
 * @swagger
 * /clients:
 *   get:
 *     summary: Get all clients with search, filter, sort, and pagination (admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by activityStatus
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: firstName
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated client list
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
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
    const users = await User.find(query)
      .select('-password')
      .collation({ locale: 'en', strength: 2 })
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Join active/trialing subscription for each client
    const userIds = users.map(u => u._id);
    const subs = await Subscription.find({
      userId: { $in: userIds },
      status: { $in: ['active', 'trialing'] },
    }).lean();

    const subByUser = {};
    for (const sub of subs) subByUser[sub.userId.toString()] = sub;

    const clients = users.map(u => ({
      ...u,
      subscription: subByUser[u._id.toString()] || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    res.json({
      clients,
      pagination: {
        page: parseInt(page),
        pages: totalPages,
        total: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch clients list', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @swagger
 * /clients/statistics:
 *   get:
 *     summary: Get client statistics (total, active, inactive, on-break counts) (admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalClients:
 *                   type: integer
 *                 activeClients:
 *                   type: integer
 *                 inactiveClients:
 *                   type: integer
 *                 onBreakClients:
 *                   type: integer
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
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
    logger.error('Failed to fetch client statistics', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @swagger
 * /clients/{id}:
 *   get:
 *     summary: Get detailed info for a specific client (admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client details
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Client not found
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete a client (admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client deleted
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Client not found
 *       500:
 *         description: Server error
 */
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
    logger.error('Failed to fetch client details', { error: err.message });
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
    logger.error('Failed to delete client', { error: err.message });
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
