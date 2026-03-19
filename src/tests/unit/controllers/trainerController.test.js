import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import trainerController from '../../../controllers/trainerController.js';
import Appointment from '../../../models/Appointment.js';
import User from '../../../models/User.js';
import mongoose from 'mongoose';

describe('trainerController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      user: { id: 'trainer123' },
      query: {},
    };
    mockRes = {
      json: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
    Appointment.aggregate.mockReset();
    Appointment.find.mockReset();
    User.find.mockReset();
    User.countDocuments.mockReset();
  });

  describe('getDashboard', () => {
    it('should return dashboard stats with aggregation', async () => {
      const mockStats = [{
        totalAppointments: 10,
        completedAppointments: 7,
        scheduledAppointments: 2,
        cancelledAppointments: 1,
        uniqueClients: 5,
        upcomingAppointments: [{ _id: 'apt1', date: '2024-01-01', clientId: 'client1' }]
      }];
      
      Appointment.aggregate.mockResolvedValue(mockStats);
      Appointment.find.mockResolvedValue([{ _id: 'apt1', clientId: { firstName: 'Client', lastName: 'One' } }]);
      User.find.mockResolvedValue([{ firstName: 'Client', lastName: 'One', email: 'client@example.com' }]);

      await trainerController.getDashboard(mockReq, mockRes);

      expect(Appointment.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: { trainerId: expect.any(Object) } },
        expect.objectContaining({ $group: expect.any(Object) })
      ]));
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        overview: expect.objectContaining({
          totalAppointments: 10,
          completionRate: 70
        }),
        upcomingAppointments: expect.any(Array),
        clients: expect.any(Array)
      }));
    });

    it('should handle zero appointments', async () => {
      Appointment.aggregate.mockResolvedValue([{
        totalAppointments: 0,
        uniqueClients: 0,
        upcomingAppointments: []
      }]);

      await trainerController.getDashboard(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        overview: expect.objectContaining({ totalAppointments: 0, completionRate: 0 })
      }));
    });
  });

  describe('getClients', () => {
    it('should paginate clients with search', async () => {
      User.countDocuments.mockResolvedValue(25);
      User.find.mockResolvedValue([
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
      ]);

      mockReq.query = { search: 'john', page: '1', limit: '10' };

      await trainerController.getClients(mockReq, mockRes);

      expect(User.countDocuments).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: expect.objectContaining({
          currentPage: 1,
          totalPages: 3,
          totalClients: 25
        })
      }));
    });

    it('should handle no search filter', async () => {
      mockReq.query = { page: '1', limit: '10' };

      await trainerController.getClients(mockReq, mockRes);

      expect(User.find).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.any(Object) }),
        expect.any(String)
      );
    });
  });

  describe('getAppointments', () => {
    it('should filter active appointments with pagination', async () => {
      Appointment.aggregate.mockResolvedValue([
        { total: 15 },
        { _id: 'apt1', date: '2024-01-15', client: { firstName: 'Jane' } }
      ]);

      mockReq.query = { page: '1', limit: '10', view: 'active' };

      await trainerController.getAppointments(mockReq, mockRes);

      expect(Appointment.aggregate).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: expect.objectContaining({ currentPage: 1 })
      }));
    });

    it('should filter archive view (cancelled/old completed)', async () => {
      const now = new Date();
      mockReq.query.view = 'archive';

      await trainerController.getAppointments(mockReq, mockRes);

      expect(Appointment.aggregate.mock.calls[0][0]).toContainEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            $or: expect.arrayContaining([
              { status: 'cancelled' }
            ])
          })
        })
      );
    });

    it('should apply search across client fields', async () => {
      mockReq.query.search = 'jane';

      await trainerController.getAppointments(mockReq, mockRes);

      expect(Appointment.aggregate.mock.calls).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              $or: expect.arrayContaining([
                { 'client.firstName': expect.any(RegExp) }
              ])
            })
          })
        ])
      );
    });
  });

  describe('getAppointmentById', () => {
    it('should return single appointment with populate', async () => {
      const mockApt = {
        _id: 'apt123',
        populate: jest.fn().mockResolvedValue({ trainerId: { _id: 'trainer123' } })
      };
      Appointment.findById.mockResolvedValue(mockApt);

      mockReq.params.id = 'apt123';

      await trainerController.getAppointmentById(mockReq, mockRes);

      expect(Appointment.findById).toHaveBeenCalledWith('apt123');
      expect(mockApt.populate).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockApt);
    });

    it('should throw if trainer mismatch', async () => {
      Appointment.findById.mockResolvedValue({ trainerId: { _id: 'wrongTrainer' } });

      mockReq.params.id = 'aptWrong';

      await expect(trainerController.getAppointmentById(mockReq, mockRes))
        .rejects.toThrow();
    });
  });

  describe('updateAppointment', () => {
    it('should update status and notes', async () => {
      const mockApt = {
        status: 'scheduled',
        trainerId: 'trainer123',
        save: jest.fn().mockResolvedValue(),
        populate: jest.fn().mockResolvedValue()
      };
      Appointment.findById.mockResolvedValue(mockApt);

      mockReq.params.id = 'aptUpdate';
      mockReq.body = { status: 'completed', notes: 'Great session' };

      await trainerController.updateAppointment(mockReq, mockRes);

      expect(mockApt.save).toHaveBeenCalled();
      expect(mockApt.status).toBe('completed');
      expect(mockApt.notes).toBe('Great session');
    });
  });

  describe('getClientInfo', () => {
    it('should return client with appointment history', async () => {
      User.findById.mockResolvedValue({ firstName: 'Client', email: 'client@test.com' });
      Appointment.find.mockResolvedValue([{ status: 'completed' }]);

      mockReq.params.clientId = 'client456';

      await trainerController.getClientInfo(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('client456');
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        client: expect.objectContaining({ firstName: 'Client' }),
        appointmentHistory: expect.any(Array),
        appointmentCount: 1
      }));
    });
  });
});

