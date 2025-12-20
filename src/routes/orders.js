const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const auth = require('../middleware/auth');

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
        const cart = await Cart.findOne({ user: req.user.id }).populate('items.program');

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
            quantity: item.quantity,
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
        const orders = await Order.find({ user: req.user.id })
            .populate('items.program')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (err) {
        console.error(err.message);
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

module.exports = router;