const express = require('express');
const { auth } = require('../middleware/auth');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { createProductCheckoutSession, PRODUCT_MAP } = require('../services/stripe');

const router = express.Router();

// POST /api/v1/products/checkout
// Create a checkout session for product purchases
router.post('/checkout', auth, async (req, res) => {
  try {
    const { items } = req.body;

    // Validate request
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and cannot be empty'
      });
    }

    // Validate each item
    for (const item of items) {
      if (!item.productKey || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          error: 'Each item must have productKey and quantity (minimum 1)'
        });
      }

      // Check if product key exists in PRODUCT_MAP
      if (!PRODUCT_MAP[item.productKey]) {
        return res.status(400).json({
          success: false,
          error: `Invalid product key: ${item.productKey}`
        });
      }
    }

    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // Create customer if not exists
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: user._id.toString(),
          source: 'jefitness_product_purchase'
        }
      });
      customerId = customer.id;

      // Update user with customer ID
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Build line items for Stripe
    const lineItems = items.map(item => {
      const product = PRODUCT_MAP[item.productKey];
      return {
        price: product.priceId,
        quantity: item.quantity
      };
    });

    // Create checkout session
    const successUrl = `${req.protocol}://${req.get('host')}/pages/products.html?success=true`;
    const cancelUrl = `${req.protocol}://${req.get('host')}/pages/products.html?canceled=true`;

    const session = await createProductCheckoutSession(
      customerId,
      items.map(item => ({
        productKey: item.productKey,
        name: PRODUCT_MAP[item.productKey].name,
        quantity: item.quantity,
        price: null, // Will be fetched from priceId
        productId: PRODUCT_MAP[item.productKey].productId
      })),
      successUrl,
      cancelUrl
    );

    // Create pending purchase record
    const totalAmount = items.reduce((sum, item) => {
      // For now, we'll calculate based on known prices, but in production this should come from Stripe
      // This is a temporary calculation - in real implementation, get prices from Stripe
      return sum + (item.quantity * 1599); // Default to small size price, should be improved
    }, 0);

    const purchase = new Purchase({
      userId: user._id,
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: session.id,
      items: items.map(item => ({
        productKey: item.productKey,
        name: PRODUCT_MAP[item.productKey].name,
        quantity: item.quantity,
        unitPrice: 1599, // Should be fetched from Stripe price
        totalPrice: item.quantity * 1599
      })),
      totalAmount,
      currency: 'usd',
      status: 'pending',
      billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production'
    });

    await purchase.save();

    res.json({
      success: true,
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session'
    });
  }
});

// GET /api/v1/products/orders
// Get user's purchase orders
router.get('/orders', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email');

    res.json({
      success: true,
      purchases
    });

  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

module.exports = router;
