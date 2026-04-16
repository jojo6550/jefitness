const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const {
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} = require('../middleware/errorHandler');
const {
  sendNewTicketAdmin,
  sendTicketReceived,
  sendTicketFulfilled,
} = require('../services/email');
const { logger, logUserAction, logAdminAction } = require('../services/logger');

const CATEGORY_LABELS = {
  'bug-report': 'Bug Report',
  'feature-request': 'Feature Request',
  'billing-issue': 'Billing Issue',
  'account-issue': 'Account Issue',
  'general-inquiry': 'General Inquiry',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);
const WEEKLY_LIMIT = 5;

/**
 * Check if user has hit the 7-day submission limit.
 * Counts tickets with status submitted/seen/resolved created in last 7 days.
 */
async function checkRateLimit(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = await SupportTicket.countDocuments({
    userId,
    status: { $in: ['submitted', 'seen', 'resolved'] },
    createdAt: { $gte: sevenDaysAgo },
  });
  return count;
}

/**
 * Get the reset date: oldest submitted ticket's createdAt + 7 days.
 */
async function getRateLimitResetDate(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldest = await SupportTicket.findOne(
    {
      userId,
      status: { $in: ['submitted', 'seen', 'resolved'] },
      createdAt: { $gte: sevenDaysAgo },
    },
    'createdAt'
  )
    .sort({ createdAt: 1 })
    .lean();
  if (!oldest) return null;
  return new Date(oldest.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

// ── User: Create ticket (draft or submit) ─────────────────────────────────────
const createTicket = asyncHandler(async (req, res) => {
  const { subject, description, category, status = 'draft' } = req.body;

  if (!subject || !description || !category) {
    throw new ValidationError('Subject, description, and category are required.');
  }
  if (subject.length > 120)
    throw new ValidationError('Subject must be 120 characters or less.');
  if (description.length > 2000)
    throw new ValidationError('Description must be 2000 characters or less.');
  if (!VALID_CATEGORIES.includes(category))
    throw new ValidationError('Invalid category.');
  if (!['draft', 'submitted'].includes(status))
    throw new ValidationError('Status must be draft or submitted.');

  if (status === 'submitted') {
    const count = await checkRateLimit(req.user.id);
    if (count >= WEEKLY_LIMIT) {
      const resetDate = await getRateLimitResetDate(req.user.id);
      throw new AppError(
        `You have reached the ${WEEKLY_LIMIT} ticket limit for this week. ${resetDate ? `Resets on ${resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : ''}`,
        429
      );
    }
  }

  const ticket = await SupportTicket.create({
    userId: req.user.id,
    subject,
    description,
    category,
    status,
  });

  if (status === 'submitted') {
    const user = await User.findById(req.user.id, 'email firstName lastName').lean();
    const admins = await User.find({ role: 'admin' }, 'email firstName').lean();

    await Promise.allSettled([
      sendNewTicketAdmin(admins, ticket, user),
      sendTicketReceived(user.email, user.firstName, ticket),
    ]);

    logUserAction('submit_support_ticket', req.user.id, {
      ticketId: ticket._id,
      category,
    });
  } else {
    logUserAction('save_ticket_draft', req.user.id, { ticketId: ticket._id });
  }

  res.status(201).json({ success: true, data: { ticket } });
});

// ── User: Get own tickets ─────────────────────────────────────────────────────
const getMyTickets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(20, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    SupportTicket.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments({ userId: req.user.id }),
  ]);

  // Include rate limit info
  const weeklyCount = await checkRateLimit(req.user.id);
  const resetDate =
    weeklyCount >= WEEKLY_LIMIT ? await getRateLimitResetDate(req.user.id) : null;

  res.json({
    success: true,
    data: {
      tickets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      rateLimit: { used: weeklyCount, max: WEEKLY_LIMIT, resetDate },
    },
  });
});

// ── User: Get single own ticket ───────────────────────────────────────────────
const getMyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id).lean();
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.userId.toString() !== req.user.id)
    throw new AuthorizationError('Access denied.');
  res.json({ success: true, data: { ticket } });
});

// ── User: Update own draft ────────────────────────────────────────────────────
const updateMyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.userId.toString() !== req.user.id)
    throw new AuthorizationError('Access denied.');

  const { subject, description, category, status } = req.body;
  const isTransitioningToSubmit = status === 'submitted' && ticket.status === 'draft';

  // Can only edit drafts; status can only move draft→submitted
  if (ticket.status !== 'draft') {
    throw new AppError('Only draft tickets can be edited.', 400);
  }
  if (status && !['draft', 'submitted'].includes(status)) {
    throw new ValidationError('Status must be draft or submitted.');
  }

  if (subject !== undefined) {
    if (subject.length > 120)
      throw new ValidationError('Subject must be 120 characters or less.');
    ticket.subject = subject;
  }
  if (description !== undefined) {
    if (description.length > 2000)
      throw new ValidationError('Description must be 2000 characters or less.');
    ticket.description = description;
  }
  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category))
      throw new ValidationError('Invalid category.');
    ticket.category = category;
  }

  if (isTransitioningToSubmit) {
    const count = await checkRateLimit(req.user.id);
    if (count >= WEEKLY_LIMIT) {
      const resetDate = await getRateLimitResetDate(req.user.id);
      throw new AppError(
        `You have reached the ${WEEKLY_LIMIT} ticket limit for this week. ${resetDate ? `Resets on ${resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : ''}`,
        429
      );
    }
    ticket.status = 'submitted';
  }

  await ticket.save();

  if (isTransitioningToSubmit) {
    const user = await User.findById(req.user.id, 'email firstName lastName').lean();
    const admins = await User.find({ role: 'admin' }, 'email firstName').lean();
    await Promise.allSettled([
      sendNewTicketAdmin(admins, ticket, user),
      sendTicketReceived(user.email, user.firstName, ticket),
    ]);
    logUserAction('submit_support_ticket', req.user.id, { ticketId: ticket._id });
  } else {
    logUserAction('update_ticket_draft', req.user.id, { ticketId: ticket._id });
  }

  res.json({ success: true, data: { ticket } });
});

// ── User: Delete own draft ────────────────────────────────────────────────────
const deleteMyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.userId.toString() !== req.user.id)
    throw new AuthorizationError('Access denied.');
  if (ticket.status !== 'draft')
    throw new AppError('Only draft tickets can be deleted.', 400);

  await ticket.deleteOne();
  logUserAction('delete_ticket_draft', req.user.id, { ticketId: req.params.id });
  res.json({ success: true, data: { message: 'Draft deleted.' } });
});

// ── Admin: List all tickets ───────────────────────────────────────────────────
const adminGetTickets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'firstName lastName email')
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  // Unread count (submitted but not yet seen)
  const unreadCount = await SupportTicket.countDocuments({ status: 'submitted' });

  logAdminAction('view_support_tickets', req.user.id, { filter, page }, req);

  res.json({
    success: true,
    data: {
      tickets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      unreadCount,
    },
  });
});

// ── Admin: Get single ticket (auto-mark seen) ─────────────────────────────────
const adminGetTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('userId', 'firstName lastName email')
    .lean();
  if (!ticket) throw new NotFoundError('Ticket');

  // Auto-advance submitted → seen
  if (ticket.status === 'submitted') {
    await SupportTicket.findByIdAndUpdate(req.params.id, {
      status: 'seen',
      seenAt: new Date(),
    });
    ticket.status = 'seen';
    ticket.seenAt = new Date();
  }

  logAdminAction('view_support_ticket', req.user.id, { ticketId: req.params.id }, req);

  res.json({ success: true, data: { ticket } });
});

// ── Admin: Update ticket status ───────────────────────────────────────────────
const adminUpdateTicketStatus = asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;

  if (!status) throw new ValidationError('Status is required.');
  if (status !== 'resolved')
    throw new ValidationError('Admins can only set status to resolved.');
  if (adminNote && adminNote.length > 1000)
    throw new ValidationError('Admin note must be 1000 characters or less.');

  const ticket = await SupportTicket.findById(req.params.id).populate(
    'userId',
    'firstName lastName email'
  );
  if (!ticket) throw new NotFoundError('Ticket');
  if (!['submitted', 'seen'].includes(ticket.status)) {
    throw new AppError('Only submitted or seen tickets can be resolved.', 400);
  }

  ticket.status = 'resolved';
  ticket.resolvedAt = new Date();
  if (adminNote !== undefined) ticket.adminNote = adminNote;
  await ticket.save();

  // Email the user
  if (ticket.userId && ticket.userId.email) {
    await Promise.allSettled([
      sendTicketFulfilled(ticket.userId.email, ticket.userId.firstName, ticket),
    ]);
  }

  logAdminAction('resolve_support_ticket', req.user.id, { ticketId: ticket._id }, req);

  res.json({ success: true, data: { ticket } });
});

module.exports = {
  createTicket,
  getMyTickets,
  getMyTicket,
  updateMyTicket,
  deleteMyTicket,
  adminGetTickets,
  adminGetTicket,
  adminUpdateTicketStatus,
};
