const express = require('express');
const { auth } = require('../middleware/auth');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { createProductCheckoutSession, PRODUCT_MAP, getStripe } = require('../services/stripe');

const router = express.Router();

// GET /api/v1/products
router.get('/', async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not configured');
    }
    const products = {};

    for (const [key, product] of Object.entries(PRODUCT_MAP)) {
      try {
        const priceObj = await stripe.prices.retrieve(product.priceId);
        products[key] = {
          ...product,
          price: priceObj.unit_amount / 100,
          currency: priceObj.currency
        };
      } catch (err) {
        console.warn(`Failed to fetch price for ${key}, using default:`, err.message);
        products[key] = {
          ...product,
          price: 100.1,
          currency: 'jmd'
        };
      }
    }

    res.json({ success: true, products });

  } catch (err) {
    console.error('Products route error:', err);
    res.status(500).json({
      success: true,
      products: Object.keys(PRODUCT_MAP).reduce((acc, key) => {
        acc[key] = { ...PRODUCT_MAP[key], price: 100.1, currency: 'jmd' };
        return acc;
      }, {}),
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
        quantity: item.quantity,
        price: null,
        productId: PRODUCT_MAP[item.productKey]?.productId
      })),
      `${req.protocol}://${req.get('host')}/pages/products.html?success=true`,
      `${req.protocol}://${req.get('host')}/pages/products.html?canceled=true`
    );

    const purchase = new Purchase({
      userId: user._id,
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: session.id,
      items: items.map(item => ({
        productKey: item.productKey,
        name: PRODUCT_MAP[item.productKey]?.name || 'Unknown',
        quantity: item.quantity,
        unitPrice: PRODUCT_MAP[item.productKey]?.defaultPrice || 1599,
        totalPrice: (PRODUCT_MAP[item.productKey]?.defaultPrice || 1599) * item.quantity
      })),
      totalAmount: items.reduce((sum, i) => sum + (PRODUCT_MAP[i.productKey]?.defaultPrice || 1599) * i.quantity, 0),
      currency: 'jmd',
      status: 'pending'
    });

    await purchase.save();

    res.json({ success: true, checkoutUrl: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

// GET /api/v1/products/purchases - Get user's purchase history
router.get('/purchases', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({
      userId: req.user.id,
      status: 'completed'
    }).sort({ createdAt: -1 });

    res.json({ success: true, purchases });
  } catch (err) {
    console.error('Purchase history error:', err);
    res.status(500).json({ success: false, error: 'Failed to load purchase history' });
  }
});

module.exports = router;
