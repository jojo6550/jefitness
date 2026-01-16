const express = require('express');
const router = express.Router();
const path = require('path');
const { auth, requireAdmin } = require('../middleware/auth');

// GET /admin-dashboard.html - Serve admin dashboard page (protected)
router.get('/admin-dashboard.html', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin-dashboard.html'));
});

module.exports = router;
