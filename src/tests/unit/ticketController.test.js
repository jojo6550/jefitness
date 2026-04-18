const mongoose = require('mongoose');

jest.mock('../../models/SupportTicket');
jest.mock('../../models/User');
jest.mock('../../services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logUserAction: jest.fn(),
  logAdminAction: jest.fn(),
}));
jest.mock('../../services/email', () => ({
  sendNewTicketAdmin: jest.fn().mockResolvedValue(undefined),
  sendTicketReceived: jest.fn().mockResolvedValue(undefined),
  sendTicketFulfilled: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../middleware/errorHandler', () => {
  const actual = jest.requireActual('../../middleware/errorHandler');
  return { ...actual, asyncHandler: fn => fn };
});

const SupportTicket = require('../../models/SupportTicket');
const User = require('../../models/User');
const { logUserAction, logAdminAction } = require('../../services/logger');
const {
  sendNewTicketAdmin,
  sendTicketReceived,
  sendTicketFulfilled,
} = require('../../services/email');
const {
  createTicket,
  getMyTickets,
  getMyTicket,
  updateMyTicket,
  deleteMyTicket,
  adminGetTickets,
  adminGetTicket,
  adminUpdateTicketStatus,
} = require('../../controllers/ticketController');

function makeTicket(overrides = {}) {
  const userId = new mongoose.Types.ObjectId();
  return {
    _id: new mongoose.Types.ObjectId(),
    userId,
    subject: 'Test subject',
    description: 'Test description',
    category: 'general-inquiry',
    status: 'draft',
    adminNote: undefined,
    seenAt: null,
    resolvedAt: null,
    save: jest.fn().mockResolvedValue(true),
    deleteOne: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('ticketController', () => {
  let mockReq, mockRes, mockUserId;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();
    mockReq = {
      user: { _id: mockUserId, id: mockUserId.toString() },
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      headers: {},
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  // ── createTicket ───────────────────────────────────────────────────────────

  describe('createTicket', () => {
    it('throws ValidationError when required fields missing', async () => {
      mockReq.body = { subject: 'Test' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError when subject exceeds 120 chars', async () => {
      mockReq.body = {
        subject: 'a'.repeat(121),
        description: 'desc',
        category: 'general-inquiry',
      };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError when description exceeds 2000 chars', async () => {
      mockReq.body = {
        subject: 'Subject',
        description: 'a'.repeat(2001),
        category: 'billing-issue',
      };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError for invalid category', async () => {
      mockReq.body = { subject: 'Sub', description: 'Desc', category: 'fake-category' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError for invalid status', async () => {
      mockReq.body = {
        subject: 'Sub',
        description: 'Desc',
        category: 'bug-report',
        status: 'pending',
      };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('creates draft without sending emails', async () => {
      const ticket = makeTicket({ status: 'draft' });
      SupportTicket.create.mockResolvedValue(ticket);
      mockReq.body = {
        subject: 'Bug found',
        description: 'Details here',
        category: 'bug-report',
      };

      await createTicket(mockReq, mockRes);

      expect(sendNewTicketAdmin).not.toHaveBeenCalled();
      expect(sendTicketReceived).not.toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        'save_ticket_draft',
        mockReq.user.id,
        expect.any(Object)
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('creates submitted ticket and sends emails', async () => {
      const ticket = makeTicket({ status: 'submitted' });
      SupportTicket.create.mockResolvedValue(ticket);
      SupportTicket.countDocuments.mockResolvedValue(0);
      const user = {
        _id: mockUserId,
        email: 'u@test.com',
        firstName: 'Jo',
        lastName: 'Jo',
      };
      User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(user) });
      User.find.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ email: 'admin@test.com', firstName: 'Admin' }]),
      });
      mockReq.body = {
        subject: 'Bug found',
        description: 'Details here',
        category: 'bug-report',
        status: 'submitted',
      };

      await createTicket(mockReq, mockRes);

      expect(sendNewTicketAdmin).toHaveBeenCalled();
      expect(sendTicketReceived).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        'submit_support_ticket',
        mockReq.user.id,
        expect.any(Object)
      );
    });

    it('throws 429 AppError when rate limit reached', async () => {
      SupportTicket.countDocuments.mockResolvedValue(5);
      SupportTicket.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ createdAt: new Date() }),
        }),
      });
      mockReq.body = {
        subject: 'Sub',
        description: 'Desc',
        category: 'feature-request',
        status: 'submitted',
      };

      const { AppError } = require('../../middleware/errorHandler');
      await expect(createTicket(mockReq, mockRes)).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── getMyTickets ───────────────────────────────────────────────────────────

  describe('getMyTickets', () => {
    it('returns paginated tickets with rateLimit meta', async () => {
      const tickets = [makeTicket()];
      SupportTicket.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(tickets),
      });
      SupportTicket.countDocuments.mockResolvedValue(1);

      await getMyTickets(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.data.tickets).toHaveLength(1);
      expect(call.data.rateLimit).toHaveProperty('used');
      expect(call.data.rateLimit).toHaveProperty('max', 5);
    });
  });

  // ── getMyTicket ────────────────────────────────────────────────────────────

  describe('getMyTicket', () => {
    it('throws NotFoundError when ticket not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(getMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws AuthorizationError when ticket belongs to different user', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: new mongoose.Types.ObjectId() });
      SupportTicket.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(ticket),
      });

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(getMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        AuthorizationError
      );
    });

    it('returns ticket for owner', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: mockUserId });
      SupportTicket.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(ticket),
      });

      await getMyTicket(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: { ticket } });
    });
  });

  // ── updateMyTicket ─────────────────────────────────────────────────────────

  describe('updateMyTicket', () => {
    it('throws NotFoundError when ticket not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockResolvedValue(null);

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(updateMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws AuthorizationError when not owner', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: new mongoose.Types.ObjectId() });
      SupportTicket.findById.mockResolvedValue(ticket);

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(updateMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        AuthorizationError
      );
    });

    it('throws AppError 400 when ticket is not a draft', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: mockUserId, status: 'submitted' });
      SupportTicket.findById.mockResolvedValue(ticket);

      const { AppError } = require('../../middleware/errorHandler');
      await expect(updateMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(AppError);
    });

    it('updates draft subject and returns it', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: mockUserId, status: 'draft' });
      SupportTicket.findById.mockResolvedValue(ticket);
      mockReq.body = { subject: 'Updated subject' };

      await updateMyTicket(mockReq, mockRes);

      expect(ticket.subject).toBe('Updated subject');
      expect(ticket.save).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        'update_ticket_draft',
        mockReq.user.id,
        expect.any(Object)
      );
    });

    it('transitions draft to submitted and sends emails', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: mockUserId, status: 'draft' });
      SupportTicket.findById.mockResolvedValue(ticket);
      SupportTicket.countDocuments.mockResolvedValue(0);
      const user = { email: 'u@test.com', firstName: 'Jo', lastName: 'Jo' };
      User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(user) });
      User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      mockReq.body = { status: 'submitted' };

      await updateMyTicket(mockReq, mockRes);

      expect(ticket.status).toBe('submitted');
      expect(sendNewTicketAdmin).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        'submit_support_ticket',
        mockReq.user.id,
        expect.any(Object)
      );
    });
  });

  // ── deleteMyTicket ─────────────────────────────────────────────────────────

  describe('deleteMyTicket', () => {
    it('throws NotFoundError when ticket not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockResolvedValue(null);

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(deleteMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws AuthorizationError when not owner', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockResolvedValue(
        makeTicket({ userId: new mongoose.Types.ObjectId() })
      );

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(deleteMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        AuthorizationError
      );
    });

    it('throws AppError 400 when ticket is not a draft', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockResolvedValue(
        makeTicket({ userId: mockUserId, status: 'submitted' })
      );

      const { AppError } = require('../../middleware/errorHandler');
      await expect(deleteMyTicket(mockReq, mockRes)).rejects.toBeInstanceOf(AppError);
    });

    it('deletes draft and calls logUserAction', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ userId: mockUserId, status: 'draft' });
      SupportTicket.findById.mockResolvedValue(ticket);

      await deleteMyTicket(mockReq, mockRes);

      expect(ticket.deleteOne).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        'delete_ticket_draft',
        mockReq.user.id,
        expect.any(Object)
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Draft deleted.' },
      });
    });
  });

  // ── adminGetTickets ────────────────────────────────────────────────────────

  describe('adminGetTickets', () => {
    it('returns tickets list with pagination and unreadCount', async () => {
      const tickets = [makeTicket({ status: 'submitted' })];
      SupportTicket.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(tickets),
      });
      SupportTicket.countDocuments
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // unreadCount

      await adminGetTickets(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.data.tickets).toHaveLength(1);
      expect(call.data).toHaveProperty('unreadCount');
      expect(logAdminAction).toHaveBeenCalledWith(
        'view_support_tickets',
        mockReq.user.id,
        expect.any(Object),
        mockReq
      );
    });

    it('applies status filter from query', async () => {
      mockReq.query = { status: 'submitted' };
      SupportTicket.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      SupportTicket.countDocuments.mockResolvedValue(0);

      await adminGetTickets(mockReq, mockRes);

      expect(SupportTicket.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'submitted' })
      );
    });
  });

  // ── adminGetTicket ─────────────────────────────────────────────────────────

  describe('adminGetTicket', () => {
    it('throws NotFoundError when ticket not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(adminGetTicket(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('auto-advances submitted to seen', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ status: 'submitted' });
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(ticket),
      });
      SupportTicket.findByIdAndUpdate = jest.fn().mockResolvedValue(ticket);

      await adminGetTicket(mockReq, mockRes);

      expect(SupportTicket.findByIdAndUpdate).toHaveBeenCalledWith(
        mockReq.params.id,
        expect.objectContaining({ status: 'seen' })
      );
      expect(logAdminAction).toHaveBeenCalledWith(
        'view_support_ticket',
        mockReq.user.id,
        expect.any(Object),
        mockReq
      );
    });

    it('does not update status when already seen', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const ticket = makeTicket({ status: 'seen' });
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(ticket),
      });
      SupportTicket.findByIdAndUpdate = jest.fn();

      await adminGetTicket(mockReq, mockRes);

      expect(SupportTicket.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ── adminUpdateTicketStatus ────────────────────────────────────────────────

  describe('adminUpdateTicketStatus', () => {
    it('throws ValidationError when status missing', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = {};

      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(adminUpdateTicketStatus(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError when status is not resolved', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'seen' };

      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(adminUpdateTicketStatus(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError when adminNote exceeds 1000 chars', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'resolved', adminNote: 'a'.repeat(1001) };

      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(adminUpdateTicketStatus(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws NotFoundError when ticket not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'resolved' };
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        then: undefined,
      });
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(adminUpdateTicketStatus(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws AppError when ticket not in submitted/seen state', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'resolved' };
      const ticket = makeTicket({ status: 'resolved' });
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(ticket),
      });

      const { AppError } = require('../../middleware/errorHandler');
      await expect(adminUpdateTicketStatus(mockReq, mockRes)).rejects.toBeInstanceOf(
        AppError
      );
    });

    it('resolves ticket, sets resolvedAt, sends email, calls logAdminAction', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'resolved', adminNote: 'Issue fixed.' };
      const ticket = makeTicket({
        status: 'seen',
        userId: {
          _id: mockUserId,
          email: 'user@test.com',
          firstName: 'Jo',
          lastName: 'Jo',
        },
      });
      SupportTicket.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(ticket),
      });

      await adminUpdateTicketStatus(mockReq, mockRes);

      expect(ticket.status).toBe('resolved');
      expect(ticket.resolvedAt).toBeInstanceOf(Date);
      expect(ticket.adminNote).toBe('Issue fixed.');
      expect(ticket.save).toHaveBeenCalled();
      expect(sendTicketFulfilled).toHaveBeenCalled();
      expect(logAdminAction).toHaveBeenCalledWith(
        'resolve_support_ticket',
        mockReq.user.id,
        expect.any(Object),
        mockReq
      );
    });
  });
});
