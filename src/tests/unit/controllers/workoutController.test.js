import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import workoutController from '../../../controllers/workoutController.js';
import User from '../../../models/User.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

describe('workoutController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user123' },
      body: {},
      params: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    jest.clearAllMocks();
    User.findById.mockReset();
  });

  describe('logWorkout', () => {
    it('should log workout with sanitization - happy path', async () => {
      const mockUser = {
        _id: 'user123',
        workoutLogs: [],
        save: jest.fn().mockResolvedValue({ workoutLogs: [{ _id: 'log1' }] })
      };
      User.findById.mockResolvedValue(mockUser);

      mockReq.body = {
        workoutName: '<script>alert(1)</script> Bench Press',
        date: '2024-01-15',
        exercises: [{
          exerciseName: 'Bench Press',
          sets: [{ setNumber: 1, reps: 10, weight: 100, rpe: 8 }]
        }],
        duration: 45,
        notes: 'Felt strong today'
      };

      await workoutController.logWorkout(mockReq, mockRes);

      expect(sanitizeHtml).toHaveBeenCalledWith('<script>alert(1)</script> Bench Press', expect.any(Object));
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        workout: expect.objectContaining({ workoutName: 'Bench Press' })
      }));
    });

    it('should throw validation error for missing data', async () => {
      User.findById.mockResolvedValue({ _id: 'user123' });
      mockReq.body = { workoutName: 'Test' }; // No exercises

      await expect(workoutController.logWorkout(mockReq, mockRes))
        .rejects.toThrow('Workout name and at least one exercise are required');
    });

    it('should handle user not found', async () => {
      User.findById.mockResolvedValue(null);

      await expect(workoutController.logWorkout(mockReq, mockRes))
        .rejects.toThrow();
    });
  });

  describe('getWorkouts', () => {
    it('should paginate workouts correctly', async () => {
      const mockUser = {
        workoutLogs: [
          { _id: 'log1', date: '2024-01-15', deletedAt: null },
          { _id: 'log2', date: '2024-01-10', deletedAt: null },
          { _id: 'log3', date: '2024-01-05', deletedAt: new Date() }
        ]
      };
      User.findById.mockResolvedValue(mockUser);

      mockReq.query.page = '1';
      mockReq.query.limit = '2';
      mockReq.query.sortOrder = 'asc';

      await workoutController.getWorkouts(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        workouts: expect.arrayContaining([expect.objectContaining({ _id: 'log3' }), expect.objectContaining({ _id: 'log2' })]),
        pagination: expect.objectContaining({
          currentPage: 1,
          totalWorkouts: 2,
          totalPages: 1
        })
      }));
    });

    it('should return empty for no workouts', async () => {
      User.findById.mockResolvedValue({ workoutLogs: [] });

      await workoutController.getWorkouts(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        workouts: [],
        pagination: expect.objectContaining({ totalWorkouts: 0 })
      }));
    });
  });

  describe('getWorkoutById', () => {
    it('should return single workout', async () => {
      const mockUser = {
        workoutLogs: [{ _id: mongoose.Types.ObjectId('log456'), workoutName: 'Test Workout' }]
      };
      User.findById.mockResolvedValue(mockUser);

      mockReq.params.id = 'log456';

      await workoutController.getWorkoutById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        workout: expect.objectContaining({ _id: expect.any(Object), workoutName: 'Test Workout' })
      });
    });

    it('should throw for invalid ID', async () => {
      mockReq.params.id = 'invalid';

      await expect(workoutController.getWorkoutById(mockReq, mockRes))
        .rejects.toThrow('Invalid workout ID');
    });

    it('should throw for deleted workout', async () => {
      User.findById.mockResolvedValue({ workoutLogs: [{ _id: 'logDel', deletedAt: new Date() }] });

      await expect(workoutController.getWorkoutById(mockReq, mockRes))
        .rejects.toThrow('Workout');
    });
  });

  describe('deleteWorkout', () => {
    it('should soft delete workout', async () => {
      const mockUser = {
        workoutLogs: [{ _id: 'logDel', deletedAt: null }],
        save: jest.fn().mockResolvedValue()
      };
      User.findById.mockResolvedValue(mockUser);

      mockReq.params.id = 'logDel';

      await workoutController.deleteWorkout(mockReq, mockRes);

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Workout deleted successfully' });
    });
  });

  describe('getExerciseProgress', () => {
    it('should calculate exercise progress stats', async () => {
      const mockUser = {
        workoutLogs: [
          {
            date: '2024-01-15',
            exercises: [{
              exerciseName: 'Bench Press',
              sets: [{ reps: 10, weight: 100 }, { reps: 8, weight: 110 }]
            }]
          },
          {
            date: '2024-01-10', 
            exercises: [{
              exerciseName: 'Bench Press',
              sets: [{ reps: 12, weight: 90 }]
            }]
          }
        ]
      };
      User.findById.mockResolvedValue(mockUser);

      mockReq.params.exerciseName = 'bench%20press';

      await workoutController.getExerciseProgress(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          sessions: expect.any(Array),
          maxWeight: 110,
          averageVolume: expect.any(Number)
        })
      }));
    });

    it('should handle no matching exercises', async () => {
      User.findById.mockResolvedValue({ workoutLogs: [] });

      mockReq.params.exerciseName = 'unknown';

      await workoutController.getExerciseProgress(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { sessions: [], maxWeight: 0, totalSets: 0, totalReps: 0, averageVolume: 0, frequency: 0 }
      }));
    });
  });

  describe('getStatsSummary', () => {
    it('should compute workout stats', async () => {
      const mockUser = {
        workoutLogs: [
          { date: '2024-01-15', workoutName: 'Leg Day', totalVolume: 2000 },
          { date: '2024-01-10', workoutName: 'Push Day', totalVolume: 1500, deletedAt: new Date() }
        ]
      };
      User.findById.mockResolvedValue(mockUser);

      await workoutController.getStatsSummary(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        stats: expect.objectContaining({
          totalWorkouts: 1,
          lastWorkout: expect.objectContaining({ workoutName: 'Leg Day' })
        })
      }));
    });

    it('should handle empty workouts', async () => {
      User.findById.mockResolvedValue({ workoutLogs: [] });

      await workoutController.getStatsSummary(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        stats: { totalWorkouts: 0, lastWorkout: null, mostTrainedExercise: null, weeklyVolume: 0, totalVolume: 0 }
      }));
    });
  });
});

