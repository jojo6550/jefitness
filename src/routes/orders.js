const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const auth = require('../middleware/auth');
const User = require('../models/User');
const mongoose = require('mongoose');

// Generate unique order number
function generateOrderNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `ORD-${timestamp}-${random}`;
}

// POST /api/orders - Create new order from cart
router.post('/', auth, async (req, res) => {
    try {
        const { paymentMethod, billingInfo } = req.body;

        // Get user's cart
        const cart = await Cart.findOne({ userId: req.user.id }).populate('items.program');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ msg: 'Cart is empty' });
        }

        // Calculate totals
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        const tax = subtotal * 0.08; // 8% tax
        const total = subtotal + tax;

        // Create order items from cart
        const orderItems = cart.items.map(item => ({
            program: item.program._id,
            title: item.program.title,
            price: item.price
        }));

        // Create order
        const newOrder = new Order({
            user: req.user.id,
            orderNumber: generateOrderNumber(),
            items: orderItems,
            subtotal,
            tax,
            total,
            paymentMethod,
            billingInfo,
            status: 'pending'
        });

        const order = await newOrder.save();

        // Clear cart after successful order
        cart.items = [];
        await cart.save();

        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/orders - Get user's orders
router.get('/', auth, async (req, res) => {
    try {
        const orders = await Order.find({ user: new mongoose.Types.ObjectId(req.user.id) })
            .populate('items.program')
            .sort({ createdAt: -1 });

        console.log(`User action: orders_accessed | UserId: ${req.user.id} | OrderCount: ${orders.length}`);
        res.json(orders);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get user orders | UserId: ${req.user.id}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/orders/:orderId - Get specific order
router.get('/:orderId', auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('items.program');

        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        // Check if order belongs to user
        if (order.user.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/orders/admin/all - Admin route to get all orders with pagination and filtering
router.get('/admin/all', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            console.log(`User action: admin_orders_access_denied | UserId: ${req.user.id} | Reason: Insufficient permissions | RequestedRole: ${req.user.role}`);
            return res.status(403).json({ msg: 'Access denied. Admin role required.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let query = {};

        // Add search functionality
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { orderNumber: searchRegex },
                { 'user.firstName': searchRegex },
                { 'user.lastName': searchRegex },
                { 'user.email': searchRegex }
            ];
        }

        // Add status filter
        if (req.query.status) {
            query.status = req.query.status;
        }

        const orders = await Order.find(query)
            .populate('user', 'firstName lastName email')
            .populate('items.program', 'title')
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        console.log(`Admin action: orders_list_accessed | AdminId: ${req.user.id} | Page: ${page} | Limit: ${limit} | TotalOrders: ${totalOrders} | Search: ${req.query.search || 'none'} | Status: ${req.query.status || 'all'}`);
        res.json({
            orders,
            pagination: {
                currentPage: page,
                totalPages,
                totalOrders,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Admin get all orders | AdminId: ${req.user.id}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
