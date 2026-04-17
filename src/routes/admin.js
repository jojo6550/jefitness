const express = require('express');
const path = require('path');

const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');

// Serve admin dashboard — protected by auth + admin role check
router.get('/', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin.html'));
});

router.get('/dashboard', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin.html'));
});

module.exports = router;
