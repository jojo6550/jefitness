/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only page serving
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const { auth, requireAdmin } = require('../middleware/auth');
const { allowOnlyFields } = require('../middleware/inputValidator');

/**
 * @swagger
 * /admin/admin-dashboard.html:
 *   get:
 *     summary: Serve the admin dashboard HTML page
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard HTML
 *         content:
 *           text/html: {}
 *       403:
 *         description: Admin access required
 */
// GET /admin-dashboard.html - Serve admin dashboard page (protected)
router.get('/admin-dashboard.html', auth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/pages/admin-dashboard.html'));
});

module.exports = router;
