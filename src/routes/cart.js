const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth, blacklistToken } = require('../middleware/auth');


const router = express.Router();

// In-memory cart storage (in production, use MongoDB)
const carts = new Map();

/**
 * Get user's cart (or create empty one)
 * @param {string} userId - User ID
 * @returns {Object} Cart object
 */
function getOrCreateCart(userId) {
    if (!carts.has(userId)) {
        carts.set(userId, {
            userId,
            items: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }
    return carts.get(userId);
}

/**
 * Save cart
 * @param {string} userId - User ID
 * @param {Object} cart - Cart object
 */
function saveCart(userId, cart) {
    cart.updatedAt = new Date();
    carts.set(userId, cart);
}

// Product catalog (hardcoded for now - in production, load from database)
const PRODUCTS = {
    'seamoss-small': { id: 'seamoss-small', name: 'Seamoss - Small Size', price: 1599, description: 'Rich in minerals and vitamins, perfect for daily supplementation.' },
    'seamoss-large': { id: 'seamoss-large', name: 'Seamoss - Large Size', price: 2599, description: 'Larger quantity for extended use, packed with essential nutrients.' },
    'coconut-water': { id: 'coconut-water', name: 'Coconut Water', price: 899, description: 'Hydrating and refreshing, naturally rich in electrolytes.' },
    'coconut-jelly': { id: 'coconut-jelly', name: 'Coconut Jelly', price: 1299, description: 'Delicious and nutritious, a great snack for energy boost.' }
};

/**
 * Validate product ID
 */
const validateProductId = [
    param('productId').isString().custom((value) => {
        if (!PRODUCTS[value]) {
            throw new Error('Invalid product ID');
        }
        return true;
    })
];

/**
 * POST /api/cart/products
 * Add product to cart
 */
router.post('/products', auth, [
    body('productId').isString().notEmpty(),
    body('quantity').isInt({ min: 1, max: 99 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Validation failed',
                    details: errors.array()
                }
            });
        }

        const { productId, quantity } = req.body;
        const userId = req.user.id;

        // Validate product
        const product = PRODUCTS[productId];
        if (!product) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid product ID' }
            });
        }

        // Get or create cart
        const cart = getOrCreateCart(userId);

        // Check if product already in cart
        const existingItem = cart.items.find(item => item.productId === productId);

        if (existingItem) {
            // Update quantity
            existingItem.quantity = Math.min(existingItem.quantity + quantity, 99);
        } else {
            // Add new item
            cart.items.push({
                productId,
                name: product.name,
                price: product.price,
                quantity,
                addedAt: new Date()
            });
        }

        // Save cart
        saveCart(userId, cart);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = Math.round(subtotal * 0.08); // 8% tax
        const total = subtotal + tax;

        res.status(200).json({
            success: true,
            data: {
                cart: {
                    items: cart.items,
                    itemCount: cart.items.length,
                    totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0)
                },
                totals: {
                    subtotal: subtotal / 100,
                    tax: tax / 100,
                    total: total / 100
                },
                message: 'Product added to cart'
            }
        });

    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to add product to cart' }
        });
    }
});

/**
 * PUT /api/cart/products/:productId
 * Update product quantity in cart
 */
router.put('/products/:productId', auth, validateProductId, [
    body('quantity').isInt({ min: 0, max: 99 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Validation failed',
                    details: errors.array()
                }
            });
        }

        const { productId } = req.params;
        const { quantity } = req.body;
        const userId = req.user.id;

        // Get cart
        const cart = getOrCreateCart(userId);

        // Find item
        const itemIndex = cart.items.findIndex(item => item.productId === productId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: { message: 'Product not found in cart' }
            });
        }

        if (quantity <= 0) {
            // Remove item
            cart.items.splice(itemIndex, 1);
        } else {
            // Update quantity
            cart.items[itemIndex].quantity = quantity;
        }

        // Save cart
        saveCart(userId, cart);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = Math.round(subtotal * 0.08);
        const total = subtotal + tax;

        res.status(200).json({
            success: true,
            data: {
                cart: {
                    items: cart.items,
                    itemCount: cart.items.length,
                    totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0)
                },
                totals: {
                    subtotal: subtotal / 100,
                    tax: tax / 100,
                    total: total / 100
                },
                message: quantity <= 0 ? 'Product removed from cart' : 'Quantity updated'
            }
        });

    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to update cart' }
        });
    }
});

/**
 * DELETE /api/cart/products/:productId
 * Remove product from cart
 */
router.delete('/products/:productId', auth, validateProductId, async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user.id;

        // Get cart
        const cart = getOrCreateCart(userId);

        // Find and remove item
        const itemIndex = cart.items.findIndex(item => item.productId === productId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: { message: 'Product not found in cart' }
            });
        }

        cart.items.splice(itemIndex, 1);

        // Save cart
        saveCart(userId, cart);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = Math.round(subtotal * 0.08);
        const total = subtotal + tax;

        res.status(200).json({
            success: true,
            data: {
                cart: {
                    items: cart.items,
                    itemCount: cart.items.length,
                    totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0)
                },
                totals: {
                    subtotal: subtotal / 100,
                    tax: tax / 100,
                    total: total / 100
                },
                message: 'Product removed from cart'
            }
        });

    } catch (error) {
        console.error('Error removing product from cart:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to remove product from cart' }
        });
    }
});

/**
 * GET /api/cart
 * Get user's cart
 */
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get cart
        const cart = getOrCreateCart(userId);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = Math.round(subtotal * 0.08);
        const total = subtotal + tax;

        res.status(200).json({
            success: true,
            data: {
                cart: {
                    items: cart.items,
                    itemCount: cart.items.length,
                    totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
                    createdAt: cart.createdAt,
                    updatedAt: cart.updatedAt
                },
                totals: {
                    subtotal: subtotal / 100,
                    tax: tax / 100,
                    total: total / 100
                },
                products: PRODUCTS
            }
        });

    } catch (error) {
        console.error('Error getting cart:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get cart' }
        });
    }
});

/**
 * DELETE /api/cart
 * Clear user's cart
 */
router.delete('/', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Clear cart
        carts.set(userId, {
            userId,
            items: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });

        res.status(200).json({
            success: true,
            data: {
                cart: {
                    items: [],
                    itemCount: 0,
                    totalItems: 0
                },
                message: 'Cart cleared'
            }
        });

    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to clear cart' }
        });
    }
});

/**
 * GET /api/cart/products/catalog
 * Get product catalog
 */
router.get('/products/catalog', async (req, res) => {
    try {
        const productsWithDisplay = Object.entries(PRODUCTS).map(([id, product]) => ({
            id,
            name: product.name,
            price: product.price,
            displayPrice: `$${(product.price / 100).toFixed(2)}`,
            description: product.description
        }));

        res.status(200).json({
            success: true,
            data: {
                products: productsWithDisplay,
                count: productsWithDisplay.length
            }
        });

    } catch (error) {
        console.error('Error getting product catalog:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get product catalog' }
        });
    }
});

module.exports = router;
module.exports.PRODUCTS = PRODUCTS;

