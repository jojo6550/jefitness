// routes/clients.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth'); // optional if admin-only

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

        // Combine queries
        const query = { ...searchQuery, ...statusQuery };

        // Calculate pagination
        const skip = (page - 1) * limit;
        const sortDirection = sortOrder === 'desc' ? -1 : 1;

        // Get total count for pagination
        const totalCount = await User.countDocuments(query);

        // Get clients with pagination and sorting
        const clients = await User.find(query)
            .select('-password')
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
