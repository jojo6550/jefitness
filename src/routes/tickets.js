const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const {
  createTicket,
  getMyTickets,
  getMyTicket,
  updateMyTicket,
  deleteMyTicket,
  adminGetTickets,
  adminGetTicket,
  adminUpdateTicketStatus,
} = require('../controllers/ticketController');

// ── Admin routes ──────────────────────────────────────────────────────────────
// Must be registered before /:id routes to avoid conflict
router.get('/admin', auth, requireAdmin, adminGetTickets);
router.get('/admin/:id', auth, requireAdmin, adminGetTicket);
router.patch('/admin/:id/status', auth, requireAdmin, adminUpdateTicketStatus);

// ── User routes ───────────────────────────────────────────────────────────────
router.post('/', auth, createTicket);
router.get('/', auth, getMyTickets);
router.get('/:id', auth, getMyTicket);
router.patch('/:id', auth, updateMyTicket);
router.delete('/:id', auth, deleteMyTicket);

module.exports = router;
