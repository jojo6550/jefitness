const express = require('express');

const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const {
  getMonthlyRevenue,
  bulkDeleteClients,
  createSubscription,
  extendSubscription,
  getClientProfile,
} = require('../controllers/adminController');

// All admin API routes require auth + admin role
router.use(auth, requireAdmin);

router.get('/revenue', getMonthlyRevenue);
router.get('/clients/:id', getClientProfile);
router.delete('/clients/bulk', bulkDeleteClients);
router.post('/subscriptions', createSubscription);
router.post('/subscriptions/:id/extend', extendSubscription);

module.exports = router;
