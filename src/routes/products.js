const express = require('express');
const { auth } = require('../middleware/auth');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { getStripe, PRODUCT_MAP, createProductCheckoutSession } = require('../services/stripe');

const router = express.Router();

/**
 * GET /api/v1/products
 * Public: Fetch live prices from Stripe
 */
router.get('/', async (req, res) => {
  try {
    const stripe = getStripe();
    const products = {};

    for (const [key, product] of Object.entries(PRODUCT_MAP)) {
      if (!product.priceId || !stripe) {
        products[key] = { price: 0, currency: 'usd' };
        continue;
      }

      const price = await stripe.prices.retrieve(product.priceId);
      products[key] = {
        price: price.unit_amount, // cents
        currency: price.currency
      };
    }

    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to load products' });
  }
});

/**
 * POST /api/v1/products/checkout
 */
router.post('/checkout', auth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items required' });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ success: false, error: 'Stripe not configured' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Ensure Stripe customer
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() }
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    let totalAmount = 0;
    const purchaseItems = [];

    for (const item of items) {
      const product = PRODUCT_MAP[item.productKey];
      if (!product || !product.priceId) {
        return res.status(400).json({ success: false, error: 'Invalid product' });
      }

      const price = await stripe.prices.retrieve(product.priceId);
      const unitAmount = price.unit_amount;

      totalAmount += unitAmount * item.quantity;

      purchaseItems.push({
        productKey: item.productKey,
        name: product.name,
        quantity: item.quantity,
        unitPrice: unitAmount,
        totalPrice: unitAmount * item.quantity
      });
    }

    const successUrl = `${req.protocol}://${req.get('host')}/pages/products.html?success=true`;
    const cancelUrl = `${req.protocol}://${req.get('host')}/pages/products.html?canceled=true`;

    const session = await createProductCheckoutSession(
      user.stripeCustomerId,
      items,
      successUrl,
      cancelUrl
    );

    await Purchase.create({
      userId: user._id,
      stripeCustomerId: user.stripeCustomerId,
      stripeCheckoutSessionId: session.id,
      items: purchaseItems,
      totalAmount,
      currency: 'usd',
      status: 'pending',
      billingEnvironment: process.env.STRIPE_SECRET_KEY.startsWith('sk_test')
        ? 'test'
        : 'production'
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Checkout failed' });
  }
});

/**
 * GET /api/v1/products/orders
 */
router.get('/orders', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json({ success: true, purchases });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load orders' });
  }
});

module.exports = router;
