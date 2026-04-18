const mongoose = require('mongoose');

jest.mock('../../models/User');
jest.mock('../../models/Appointment');
jest.mock('../../models/Subscription');
jest.mock('../../services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logUserAction: jest.fn(),
}));
jest.mock('../../middleware/errorHandler', () => {
  const actual = jest.requireActual('../../middleware/errorHandler');
  return { ...actual, asyncHandler: fn => fn };
});

const User = require('../../models/User');
const Appointment = require('../../models/Appointment');
const Subscription = require('../../models/Subscription');
const { logUserAction } = require('../../services/logger');
const trainerController = require('../../controllers/trainerController');

function makeAppointment(overrides = {}) {
  const trainerId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  return {
    _id: new mongoose.Types.ObjectId(),
    trainerId,
    clientId,
    date: new Date(),
    time: '10:00',
    status: 'scheduled',
    notes: '',
    statusUpdatedAt: null,
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('trainerController', () => {
  let mockReq, mockRes, mockTrainerId;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrainerId = new mongoose.Types.ObjectId();
    // Bare logger used directly in trainerController for dashboard
    global.logger = { error: jest.fn(), warn: jest.fn() };
    mockReq = {
      user: { _id: mockTrainerId, id: mockTrainerId.toString() },
      body: {},
      params: {},
      query: {},
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  // ── getMe ──────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('throws NotFoundError when trainer not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(trainerController.getMe(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('returns trainer info with trainerId field', async () => {
      const trainer = {
        _id: mockTrainerId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        trainerEmailPreference: 'daily_digest',
      };
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(trainer) }),
      });

      await trainerController.getMe(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          trainerId: mockTrainerId,
          firstName: 'John',
        })
      );
    });
  });

  // ── getDashboard ───────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    beforeEach(() => {
      // Default mocks for all the findById calls in getDashboard
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ trainerEmailPreference: 'daily_digest' }),
          catch: jest.fn().mockResolvedValue({}),
        }),
      });
      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      Appointment.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
    });

    it('returns zero-state overview when no appointments', async () => {
      Appointment.aggregate.mockResolvedValue([]);

      await trainerController.getDashboard(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.overview.totalAppointments).toBe(0);
      expect(call.overview.completionRate).toBe(0);
    });

    it('computes completionRate correctly', async () => {
      Appointment.aggregate.mockResolvedValue([
        {
          totalAppointments: 10,
          completedAppointments: 8,
          scheduledAppointments: 2,
          cancelledAppointments: 0,
          noShowAppointments: 0,
          lateAppointments: 0,
          uniqueClients: 3,
          upcomingAppointments: [],
        },
      ]);

      await trainerController.getDashboard(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.overview.completionRate).toBe(80);
    });
  });

  // ── getClients ─────────────────────────────────────────────────────────────

  describe('getClients', () => {
    it('returns clients with pagination', async () => {
      const clientId = new mongoose.Types.ObjectId();
      Appointment.find.mockResolvedValue([{ clientId }]);
      User.countDocuments.mockResolvedValue(1);
      const client = {
        _id: clientId,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
      };
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([client]),
      });

      await trainerController.getClients(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.clients).toHaveLength(1);
      expect(call.pagination.totalClients).toBe(1);
    });

    it('returns empty array when trainer has no appointments', async () => {
      Appointment.find.mockResolvedValue([]);
      User.countDocuments.mockResolvedValue(0);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });

      await trainerController.getClients(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.clients).toEqual([]);
    });
  });

  // ── getAppointmentById ─────────────────────────────────────────────────────

  // Helper: mock findById().populate().populate() chain
  function mockFindByIdChain(result) {
    const inner = { populate: jest.fn().mockResolvedValue(result) };
    Appointment.findById.mockReturnValue({ populate: jest.fn().mockReturnValue(inner) });
  }

  describe('getAppointmentById', () => {
    it('throws NotFoundError when appointment not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockFindByIdChain(null);

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.getAppointmentById(mockReq, mockRes)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws AuthorizationError when appointment belongs to different trainer', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const appt = makeAppointment({ trainerId: { _id: new mongoose.Types.ObjectId() } });
      mockFindByIdChain(appt);

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.getAppointmentById(mockReq, mockRes)
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it('returns appointment when trainer matches', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      const appt = makeAppointment({ trainerId: { _id: mockTrainerId } });
      mockFindByIdChain(appt);

      await trainerController.getAppointmentById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(appt);
    });
  });

  // ── updateAppointment ──────────────────────────────────────────────────────

  describe('updateAppointment', () => {
    it('throws NotFoundError when appointment not found', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'completed' };
      Appointment.findById.mockResolvedValue(null);

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.updateAppointment(mockReq, mockRes)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws AuthorizationError when not trainer's appointment", async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'completed' };
      const appt = makeAppointment({ trainerId: new mongoose.Types.ObjectId() });
      Appointment.findById.mockResolvedValue(appt);

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.updateAppointment(mockReq, mockRes)
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it('updates status and statusUpdatedAt', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'completed' };
      // trainerId must be a plain ObjectId so toString() matches req.user.id for auth check
      const appt = makeAppointment({ trainerId: mockTrainerId });
      // populate mocks are no-ops; controller accesses trainerId.firstName etc (undefined is fine)
      appt.populate.mockResolvedValue(undefined);
      // after populate, simulate populated fields so logUserAction has something to work with
      appt.clientId = {
        _id: new mongoose.Types.ObjectId(),
        firstName: 'C',
        lastName: 'L',
        email: 'c@t.com',
      };
      appt.trainerId = {
        _id: mockTrainerId,
        toString: () => mockTrainerId.toString(),
        firstName: 'T',
        lastName: 'R',
        email: 't@t.com',
      };
      Appointment.findById.mockResolvedValue(appt);

      await trainerController.updateAppointment(mockReq, mockRes);

      expect(appt.status).toBe('completed');
      expect(appt.statusUpdatedAt).toBeInstanceOf(Date);
      expect(appt.save).toHaveBeenCalled();
    });

    it('appends notes instead of overwriting', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { notes: 'New note' };
      const appt = makeAppointment({ trainerId: mockTrainerId, notes: 'Existing note' });
      appt.populate.mockResolvedValue(undefined);
      appt.clientId = {
        _id: new mongoose.Types.ObjectId(),
        firstName: 'C',
        lastName: 'L',
        email: 'c@t.com',
      };
      appt.trainerId = {
        _id: mockTrainerId,
        toString: () => mockTrainerId.toString(),
        firstName: 'T',
        lastName: 'R',
        email: 't@t.com',
      };
      Appointment.findById.mockResolvedValue(appt);

      await trainerController.updateAppointment(mockReq, mockRes);

      expect(appt.notes).toBe('Existing note\nNew note');
    });

    it('calls logUserAction with correct action for completed status', async () => {
      mockReq.params = { id: new mongoose.Types.ObjectId().toString() };
      mockReq.body = { status: 'completed' };
      const appt = makeAppointment({ trainerId: mockTrainerId });
      appt.populate.mockResolvedValue(undefined);
      appt.clientId = {
        _id: new mongoose.Types.ObjectId(),
        firstName: 'C',
        lastName: 'L',
        email: 'c@t.com',
      };
      appt.trainerId = {
        _id: mockTrainerId,
        toString: () => mockTrainerId.toString(),
        firstName: 'T',
        lastName: 'R',
        email: 't@t.com',
      };
      Appointment.findById.mockResolvedValue(appt);

      await trainerController.updateAppointment(mockReq, mockRes);

      expect(logUserAction).toHaveBeenCalledWith(
        'appointment_marked_on_time',
        mockReq.user.id,
        expect.any(Object)
      );
    });
  });

  // ── getClientInfo ──────────────────────────────────────────────────────────

  describe('getClientInfo', () => {
    it('throws AuthorizationError when no trainer-client relationship', async () => {
      mockReq.params = { clientId: new mongoose.Types.ObjectId().toString() };
      Appointment.exists.mockResolvedValue(null);

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.getClientInfo(mockReq, mockRes)
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it('throws NotFoundError when client not found', async () => {
      mockReq.params = { clientId: new mongoose.Types.ObjectId().toString() };
      Appointment.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      Appointment.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
      Subscription.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.getClientInfo(mockReq, mockRes)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns client with appointment history and counts', async () => {
      const clientId = new mongoose.Types.ObjectId();
      mockReq.params = { clientId: clientId.toString() };
      Appointment.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const client = {
        _id: clientId,
        firstName: 'Jane',
        toObject: jest.fn().mockReturnValue({ _id: clientId, firstName: 'Jane' }),
      };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(client) });

      const appointments = [{ status: 'completed' }, { status: 'scheduled' }];
      Appointment.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(appointments),
      });
      Subscription.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await trainerController.getClientInfo(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.appointmentCount).toBe(2);
      expect(call.completedCount).toBe(1);
    });
  });

  // ── bulkUpdateAppointments ─────────────────────────────────────────────────

  describe('bulkUpdateAppointments', () => {
    it('returns 400 when appointmentIds is not an array', async () => {
      mockReq.body = { appointmentIds: null, status: 'completed' };

      await trainerController.bulkUpdateAppointments(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('returns 400 when appointmentIds is empty array', async () => {
      mockReq.body = { appointmentIds: [], status: 'completed' };

      await trainerController.bulkUpdateAppointments(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid status', async () => {
      mockReq.body = {
        appointmentIds: [new mongoose.Types.ObjectId().toString()],
        status: 'unknown',
      };

      await trainerController.bulkUpdateAppointments(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('throws AuthorizationError when appointments do not all belong to trainer', async () => {
      const id1 = new mongoose.Types.ObjectId().toString();
      const id2 = new mongoose.Types.ObjectId().toString();
      mockReq.body = { appointmentIds: [id1, id2], status: 'completed' };
      Appointment.find.mockResolvedValue([{ _id: id1 }]); // only 1 found, 2 requested

      const { AuthorizationError } = require('../../middleware/errorHandler');
      await expect(
        trainerController.bulkUpdateAppointments(mockReq, mockRes)
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it('calls updateMany and returns updatedCount', async () => {
      const id1 = new mongoose.Types.ObjectId().toString();
      mockReq.body = { appointmentIds: [id1], status: 'completed' };
      Appointment.find.mockResolvedValue([{ _id: id1 }]);
      Appointment.updateMany.mockResolvedValue({ modifiedCount: 1 });
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ catch: jest.fn().mockResolvedValue({}) }),
        }),
      });

      await trainerController.bulkUpdateAppointments(mockReq, mockRes);

      expect(Appointment.updateMany).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, updatedCount: 1 });
    });
  });
});
