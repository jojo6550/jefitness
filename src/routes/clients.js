// routes/clients.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth, blacklistToken } = require('../middleware/auth'); // optional if admin-only

// GET /api/clients - return all users with search, filter, sort, and pagination
router.get('/', auth, async (req, res) => {
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
            limit = 10
        } = req.query;

        // Build search query
        const searchQuery = search ? {
            $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        } : {};

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
                hasPrev: page > 1
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/clients/statistics - return comprehensive client statistics
router.get('/statistics', auth, async (req, res) => {
    try {
        // Optionally, restrict to admin role
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        // Get all clients for statistics (excluding admins)
        const clients = await User.find({ role: { $ne: 'admin' } }).select('-password');

        // Calculate statistics
        const totalClients = clients.length;
        const activeClients = clients.filter(c => c.activityStatus === 'active').length;
        const inactiveClients = clients.filter(c => c.activityStatus === 'inactive').length;
        const onBreakClients = clients.filter(c => c.activityStatus === 'on-break').length;

        // Calculate average calories from nutrition logs
        let totalCalories = 0;
        let totalNutritionLogs = 0;
        clients.forEach(client => {
            if (client.nutritionLogs && client.nutritionLogs.length > 0) {
                client.nutritionLogs.forEach(log => {
                    totalCalories += log.calories || 0;
                    totalNutritionLogs++;
                });
            }
        });
        const avgCalories = totalNutritionLogs > 0 ? Math.round(totalCalories / totalNutritionLogs) : 0;

        // Calculate average sleep hours
        let totalSleepHours = 0;
        let totalSleepLogs = 0;
        clients.forEach(client => {
            if (client.sleepLogs && client.sleepLogs.length > 0) {
                client.sleepLogs.forEach(log => {
                    totalSleepHours += log.hoursSlept || 0;
                    totalSleepLogs++;
                });
            }
        });
        const avgSleep = totalSleepLogs > 0 ? (totalSleepHours / totalSleepLogs).toFixed(1) : '0.0';

        // Find top performers based on available data
        const topCalorieBurner = clients.reduce((top, client) => {
            const clientCalories = client.nutritionLogs?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0;
            const topCalories = top.nutritionLogs?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0;
            return clientCalories > topCalories ? client : top;
        }, clients[0] || null);

        const bestSleeper = clients.reduce((best, client) => {
            const avgClientSleep = client.sleepLogs?.length > 0 
                ? client.sleepLogs.reduce((sum, log) => sum + log.hoursSlept, 0) / client.sleepLogs.length 
                : 0;
            const avgBestSleep = best.sleepLogs?.length > 0 
                ? best.sleepLogs.reduce((sum, log) => sum + log.hoursSlept, 0) / best.sleepLogs.length 
                : 0;
            return avgClientSleep > avgBestSleep ? client : best;
        }, clients[0] || null);

        const mostActive = clients.filter(c => c.activityStatus === 'active')[0] || null;

        res.json({
            totalClients,
            activeClients,
            inactiveClients,
            onBreakClients,
            avgCalories,
            avgSleep,
            topPerformers: {
                topCalorieBurner: topCalorieBurner ? {
                    name: `${topCalorieBurner.firstName} ${topCalorieBurner.lastName}`,
                    calories: topCalorieBurner.nutritionLogs?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0
                } : null,
                bestSleeper: bestSleeper ? {
                    name: `${bestSleeper.firstName} ${bestSleeper.lastName}`,
                    avgSleep: bestSleeper.sleepLogs?.length > 0 
                        ? (bestSleeper.sleepLogs.reduce((sum, log) => sum + log.hoursSlept, 0) / bestSleeper.sleepLogs.length).toFixed(1)
                        : '0.0'
                } : null,
                mostActive: mostActive ? {
                    name: `${mostActive.firstName} ${mostActive.lastName}`
                } : null
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/clients/:id - get detailed info for a specific client
router.get('/:id', auth, async (req, res) => {
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
router.delete('/:id', auth, async (req, res) => {
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
