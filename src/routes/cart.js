const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Program = require('../models/Program');
const auth = require('../middleware/auth');

// GET /api/cart - Get user's cart
router.get('/', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            console.error('Auth middleware failed: req.user.id is missing');
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        let cart = await Cart.findOne({ userId: req.user.id }).populate('items.program');

        if (!cart) {
            cart = new Cart({ userId: req.user.id, items: [] });
            await cart.save();
            console.log(`User action: cart_created | UserId: ${req.user.id}`);
        }

        console.log(`User action: cart_accessed | UserId: ${req.user.id} | ItemCount: ${cart.items.length}`);
        res.json(cart);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Get user cart | UserId: ${req.user.id}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/cart/add - Add item to cart
router.post('/add', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            console.error('Auth middleware failed: req.user.id is missing');
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        const { programId, quantity = 1 } = req.body;

        // Validate program exists
        const program = await Program.findById(programId);
        if (!program) {
            console.log(`User action: cart_add_failed | UserId: ${req.user.id} | ProgramId: ${programId} | Reason: Program not found`);
            return res.status(404).json({ msg: 'Program not found' });
        }

        let cart = await Cart.findOne({ userId: req.user.id });

        if (!cart) {
            cart = new Cart({ userId: req.user.id, items: [] });
        }

        // Check if item already exists in cart
        const existingItemIndex = cart.items.findIndex(
            item => item.program.toString() === programId
        );

        if (existingItemIndex > -1) {
            // Update quantity if item already exists
            cart.items[existingItemIndex].quantity += quantity;
            console.log(`User action: cart_quantity_updated | UserId: ${req.user.id} | ProgramId: ${programId} | NewQuantity: ${cart.items[existingItemIndex].quantity}`);
        } else {
            // Add new item
            cart.items.push({
                program: programId,
                quantity: quantity,
                price: program.price
            });
            console.log(`User action: cart_item_added | UserId: ${req.user.id} | ProgramId: ${programId} | Quantity: ${quantity} | Price: ${program.price}`);
        }

        await cart.save();
        await cart.populate('items.program');

        res.json(cart);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Add item to cart | UserId: ${req.user.id} | ProgramId: ${req.body.programId}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// PUT /api/cart/update/:itemId - Update cart item quantity
router.put('/update/:itemId', auth, async (req, res) => {
    try {
        const { quantity } = req.body;

        if (quantity < 1) {
            console.log(`User action: cart_update_failed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | Reason: Invalid quantity | Quantity: ${quantity}`);
            return res.status(400).json({ msg: 'Quantity must be at least 1' });
        }

        const cart = await Cart.findOne({ userId: req.user.id });

        if (!cart) {
            console.log(`User action: cart_update_failed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | Reason: Cart not found`);
            return res.status(404).json({ msg: 'Cart not found' });
        }

        const item = cart.items.id(req.params.itemId);
        if (!item) {
            console.log(`User action: cart_update_failed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | Reason: Item not found in cart`);
            return res.status(404).json({ msg: 'Item not found in cart' });
        }

        const oldQuantity = item.quantity;
        item.quantity = quantity;
        await cart.save();
        await cart.populate('items.program');

        console.log(`User action: cart_item_quantity_updated | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | ProgramId: ${item.program} | OldQuantity: ${oldQuantity} | NewQuantity: ${quantity}`);
        res.json(cart);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Update cart item quantity | UserId: ${req.user.id} | ItemId: ${req.params.itemId}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// DELETE /api/cart/remove/:itemId - Remove item from cart
router.delete('/remove/:itemId', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            console.error('Auth middleware failed: req.user.id is missing');
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        const cart = await Cart.findOne({ userId: req.user.id });

        if (!cart) {
            console.log(`User action: cart_remove_failed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | Reason: Cart not found`);
            return res.status(404).json({ msg: 'Cart not found' });
        }

        const itemToRemove = cart.items.find(item => item._id.toString() === req.params.itemId);
        if (!itemToRemove) {
            console.log(`User action: cart_remove_failed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | Reason: Item not found in cart`);
            return res.status(404).json({ msg: 'Item not found in cart' });
        }

        cart.items = cart.items.filter(item => item._id.toString() !== req.params.itemId);

        await cart.save();
        await cart.populate('items.program');

        console.log(`User action: cart_item_removed | UserId: ${req.user.id} | ItemId: ${req.params.itemId} | ProgramId: ${itemToRemove.program}`);
        res.json(cart);
    } catch (err) {
        console.error(`Error: ${JSON.stringify(err)} | Context: Remove item from cart | UserId: ${req.user.id} | ItemId: ${req.params.itemId}`);
        res.status(500).json({ msg: 'Server error' });
    }
});

// DELETE /api/cart/clear - Clear entire cart
router.delete('/clear', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            console.error('Auth middleware failed: req.user.id is missing');
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        const cart = await Cart.findOne({ userId: req.user.id });

        if (!cart) {
            return res.status(404).json({ msg: 'Cart not found' });
        }

        cart.items = [];
        await cart.save();

        res.json(cart);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;