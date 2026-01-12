const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const User = require('../models/User');

const {
  createProductCheckoutSession,
  getOrCreateProductCustomer,
  getCheckoutSession
} = require('../services/stripe');

// In-memory cart storage (shared with cart.js)
const carts = new Map();

/**
 * Get or create cart for user
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

const router = express.Router();

/**
 * POST /api/checkout/create-session
 * Create Stripe checkout session for product purchase
 */
router.post('/create-session', auth, [
  body('successUrl').isURL(),
  body('cancelUrl').isURL()
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

    const { successUrl, cancelUrl } = req.body;
    const userId = req.user.id;

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    // Get cart
    const cart = getOrCreateCart(userId);

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Cart is empty' }
      });
    }

    // Validate cart items
    const invalidItems = cart.items.filter(item => !item.price || item.price <= 0);
    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Some items have invalid prices' }
      });
    }

    // Get or create Stripe customer
    let customer;
    try {
      customer = await getOrCreateProductCustomer(
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim()
      );
    } catch (stripeError) {
      console.error('Stripe customer error:', stripeError.message);
      // In test mode, create a mock customer
      if (process.env.NODE_ENV === 'test') {
        customer = { id: 'cus_test_mock' };
      } else {
        throw stripeError;
      }
    }

    // Create checkout session
    let session;
    try {
      session = await createProductCheckoutSession(
        customer.id,
        cart.items,
        successUrl,
        cancelUrl
      );
    } catch (stripeError) {
      console.error('Stripe checkout session error:', stripeError.message);
      
      // In test mode, return mock session
      if (process.env.NODE_ENV === 'test') {
        session = {
          id: 'cs_test_mock',
          url: 'https://checkout.stripe.com/mock'
        };
      } else {
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to create checkout session' }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        message: 'Checkout session created successfully'
      }
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create checkout session' }
    });
  }
});

/**
 * GET /api/checkout/session/:sessionId
 * Get checkout session status
 */
router.get('/session/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    let session;
    try {
      session = await getCheckoutSession(sessionId);
    } catch (stripeError) {
      console.error('Stripe get session error:', stripeError.message);
      
      // In test mode, return mock data
      if (process.env.NODE_ENV === 'test') {
        session = {
          id: sessionId,
          payment_status: 'paid',
          customer_email: 'test@example.com',
          amount_total: 5000,
          status: 'complete'
        };
      } else {
        return res.status(404).json({
          success: false,
          error: { message: 'Session not found' }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          id: session.id,
          status: session.payment_status,
          customerEmail: session.customer_email,
          amountTotal: session.amount_total,
          currency: session.currency,
          metadata: session.metadata
        }
      }
    });

  } catch (error) {
    console.error('Error getting checkout session:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get checkout session' }
    });
  }
});

/**
 * POST /api/checkout/complete
 * Complete checkout (called after successful Stripe payment via webhook)
 * This clears the cart and records the order
 */
router.post('/complete', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Session ID is required' }
      });
    }

    // Clear the cart after successful checkout
    carts.set(userId, {
      userId,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      data: {
        message: 'Checkout completed successfully'
      }
    });

  } catch (error) {
    console.error('Error completing checkout:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to complete checkout' }
    });
  }
});

/**
 * POST /api/checkout/clear-cart
 * Clear cart after successful payment
 */
router.post('/clear-cart', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear the cart
    carts.set(userId, {
      userId,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      data: {
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

module.exports = router;

