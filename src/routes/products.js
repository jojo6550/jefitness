const express = require('express');
const { auth } = require('../middleware/auth');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { createProductCheckoutSession, PRODUCT_MAP, getStripe } = require('../services/stripe');

const router = express.Router();

// GET /api/v1/products
// Fetch product prices dynamically from Stripe (public endpoint)
router.get('/', async (req, res) => {
  try {
    let stripe = null;
    try {
      stripe = getStripe();
    } catch (err) {
      console.warn('Stripe not initialized:', err.message);
    }

    const products = {};

    for (const [key, product] of Object.entries(PRODUCT_MAP)) {
      try {
        if (!stripe || !product.priceId) {
          // fallback price if Stripe unavailable or priceId missing
          products[key] = { price: 100.1, currency: 'usd' };
          continue;
        }

        const price = await stripe.prices.retrieve(product.priceId);
        products[key] = {
          price: price.unit_amount / 100, // cents to dollars
          currency: price.currency
        };
      } catch (err) {
        console.warn(`Failed to fetch price for ${key}:`, err.message);
        products[key] = { price: 100.1, currency: 'usd' };
      }
    }

    res.json({ success: true, products });

  } catch (err) {
    console.error('Products route error:', err);
    res.status(500).json({
      success: false,
      products: {},
      error: 'Failed to load products'
    });
  }
});

// POST /api/v1/products/checkout
router.post('/checkout', auth, async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items array is required' });
    }

    for (const item of items) {
      if (!item.productKey || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          error: 'Each item must have productKey and quantity >= 1'
        });
      }
      if (!PRODUCT_MAP[item.productKey]) {
        return res.status(400).json({
          success: false,
          error: `Invalid product key: ${item.productKey}`
        });
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user._id.toString(), source: 'jefitness_product_purchase' }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await createProductCheckoutSession(
      customerId,
      items.map(item => ({
        productKey: item.productKey,
        name: PRODUCT_MAP[item.productKey].name,
        quantity: item.quantity,
        price: null,
        productId: PRODUCT_MAP[item.productKey].productId
      })),
      `${req.protocol}://${req.get('host')}/pages/products.html?success=true`,
      `${req.protocol}://${req.get('host')}/pages/products.html?canceled=true`
    );

    // Save pending purchase record
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * 1599, 0);
    const purchase = new Purchase({
      userId: user._id,
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: session.id,
      items: items.map(item => ({
        productKey: item.productKey,
        name: PRODUCT_MAP[item.productKey].name,
        quantity: item.quantity,
        unitPrice: 1599,
        totalPrice: item.quantity * 1599
      })),
      totalAmount,
      currency: 'usd',
      status: 'pending',
      billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'production'
    });

    await purchase.save();

    res.json({ success: true, checkoutUrl: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

// GET /api/v1/products/orders
router.get('/orders', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email');

    res.json({ success: true, purchases });

  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

module.exports = router;
