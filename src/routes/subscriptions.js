const express = require('express');

const router = express.Router();
const { body } = require('express-validator');

const subscriptionController = require('../controllers/subscriptionController');
const { auth } = require('../middleware/auth');
const {
  preventNoSQLInjection,
  stripDangerousFields,
} = require('../middleware/inputValidator');
const { handleValidationErrors } = require('../middleware/inputValidator');

router.use(preventNoSQLInjection);
router.use(stripDangerousFields);

router.get('/plans', subscriptionController.getPlans);

router.get('/config/paypal-client-id', (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || '' });
});

router.post(
  '/checkout',
  auth,
  [body('plan').trim().notEmpty().withMessage('Plan is required')],
  handleValidationErrors,
  subscriptionController.createCheckout
);

router.get('/current', auth, subscriptionController.getCurrentSubscription);

router.post(
  '/verify-payment/:orderId',
  auth,
  subscriptionController.verifyPayment
);

router.post('/cancel', auth, subscriptionController.cancel);

module.exports = router;
