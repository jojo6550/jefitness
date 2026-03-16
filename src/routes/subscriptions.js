const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { auth } = require('../middleware/auth');
const { preventNoSQLInjection, stripDangerousFields } = require('../middleware/inputValidator');

const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/inputValidator');

// SECURITY: Apply input validation to all subscription routes
router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

/**
 * @swagger
 * /api/v1/subscriptions/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Subscriptions]
 */
router.get('/plans', subscriptionController.getPlans);

/**
 * @swagger
 * /api/v1/subscriptions/checkout:
 *   post:
 *     summary: Create a checkout session
 *     tags: [Subscriptions]
 */
router.post('/checkout', 
  auth, 
  [
    body('planId')
      .trim()
      .notEmpty()
      .withMessage('Plan ID is required')
      .isIn(['1-month', '3-month', '6-month', '12-month'])
      .withMessage('Invalid plan ID')
  ],
  handleValidationErrors,
  subscriptionController.createCheckout
);

/**
 * @swagger
 * /api/v1/subscriptions/current:
 *   get:
 *     summary: Get current subscription
 *     tags: [Subscriptions]
 */
router.get('/current', auth, subscriptionController.getCurrentSubscription);

/**
 * @swagger
 * /api/v1/subscriptions/verify-session/:sessionId:
 *   post:
 *     summary: Verify checkout session completion
 *     tags: [Subscriptions]
 */
router.post('/verify-session/:sessionId', auth, subscriptionController.verifyCheckoutSession);

/**
 * @swagger
 * /api/v1/subscriptions/cancel/:subscriptionId:
 *   post:
 *     summary: Cancel a subscription
 *     tags: [Subscriptions]
 */
router.post('/cancel/:subscriptionId', auth, subscriptionController.cancel);

/**
 * @swagger
 * /api/v1/subscriptions/refresh:
 *   get:
 *     summary: Refresh subscription status from Stripe (force sync)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.get('/refresh', auth, subscriptionController.refresh);

/**
 * @swagger
 * /api/v1/subscriptions/{subscriptionId}/invoices:
 *   get:
 *     summary: Get invoices for a subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe subscription ID
 */
router.get('/:subscriptionId/invoices', auth, subscriptionController.getSubscriptionInvoices);

module.exports = router;
