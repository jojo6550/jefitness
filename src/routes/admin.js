const express = require('express');
const path = require('path');

const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Serve admin dashboard — protected by auth + admin role check
router.get('/', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin.html'));
});

// Serve admin dashboard at /admin-dashboard
router.get('/dashboard', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin.html'));
});

// API routes
router.post('/subscriptions', auth, requireAdmin, adminController.createSubscription);
router.post(
  '/subscriptions/:id/extend',
  auth,
  requireAdmin,
  adminController.extendSubscription
);

module.exports = router;
