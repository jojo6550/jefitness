const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { createOrRetrieveCustomer, createSubscription, getCustomerSubscriptions } = require('../services/stripe');

const router = express.Router();

/**
 * POST /api/subscriptions/create
 * Create a new subscription
 */
router.post('/create', [
  body('email').isEmail().normalizeEmail(),
  body('paymentMethodId').isString().notEmpty(),
  body('plan').isIn(['1-month', '3-month', '6-month', '12-month'])
], async (req, res) => {
  try {
    // Check validation errors
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

    const { email, paymentMethodId, plan } = req.body;

    // Create or retrieve customer
    const customer = await createOrRetrieveCustomer(email, paymentMethodId);

    // Create subscription
    const subscription = await createSubscription(customer.id, plan);

    res.status(201).json({
      success: true,
      data: {
        subscription,
        customer: {
          id: customer.id,
          email: customer.email
        }
      }
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create subscription'
      }
    });
  }
});

/**
 * GET /api/subscriptions/:customerId
 * Get all subscriptions for a customer
 */
router.get('/:customerId', [
  param('customerId').isString().notEmpty()
], async (req, res) => {
  try {
    // Check validation errors
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

    const { customerId } = req.params;

    // Get customer subscriptions
    const subscriptions = await getCustomerSubscriptions(customerId);

    res.json({
      success: true,
      data: {
        subscriptions,
        count: subscriptions.length
      }
    });

  } catch (error) {
    console.error('Error retrieving subscriptions:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to retrieve subscriptions'
      }
    });
  }
});

module.exports = router;
