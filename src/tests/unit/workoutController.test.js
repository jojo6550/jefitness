const mongoose = require('mongoose');

jest.mock('../../models/User');
jest.mock('sanitize-html', () => str => str);
jest.mock('../../services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logUserAction: jest.fn(),
}));
jest.mock('../../middleware/errorHandler', () => {
  const actual = jest.requireActual('../../middleware/errorHandler');
  return { ...actual, asyncHandler: fn => fn };
});

const User = require('../../models/User');
const { logUserAction } = require('../../services/logger');
const {
  logWorkout,
  getWorkouts,
  getWorkoutById,
  deleteWorkout,
  getExerciseProgress,
  getStatsSummary,
} = require('../../controllers/workoutController');

function makeSubdocArray(items) {
  const arr = [...items];
  arr.id = searchId =>
    arr.find(item => item._id.toString() === searchId.toString()) ?? null;
  return arr;
}

function makeWorkout(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    workoutName: 'Chest Day',
    date: new Date(),
    exercises: [
      {
        exerciseName: 'Bench Press',
        sets: [{ setNumber: 1, reps: 10, weight: 100, completed: true }],
      },
    ],
    totalVolume: 1000,
    duration: 60,
    deletedAt: null,
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    workoutLogs: makeSubdocArray([]),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('workoutController', () => {
  let mockReq, mockRes, mockUserId;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();
    mockReq = {
      user: { _id: mockUserId, id: mockUserId.toString() },
      body: {},
      params: {},
      query: {},
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  // ── logWorkout ─────────────────────────────────────────────────────────────

  describe('logWorkout', () => {
    it('throws ValidationError when workoutName is missing', async () => {
      mockReq.body = { exercises: [{ exerciseName: 'Squat', sets: [] }] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when exercises is empty', async () => {
      mockReq.body = { workoutName: 'Leg Day', exercises: [] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when exercises is not an array', async () => {
      mockReq.body = { workoutName: 'Leg Day', exercises: 'not-an-array' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when user not found', async () => {
      mockReq.body = {
        workoutName: 'Push Day',
        exercises: [
          { exerciseName: 'Push-up', sets: [{ setNumber: 1, reps: 20, weight: 0 }] },
        ],
      };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(logWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('creates workout log successfully and returns 201', async () => {
      const workout = makeWorkout();
      const mockUser = makeUser();
      mockUser.workoutLogs.push(workout);
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      mockReq.body = {
        workoutName: 'Push Day',
        exercises: [
          { exerciseName: 'Bench Press', sets: [{ setNumber: 1, reps: 10, weight: 80 }] },
        ],
      };

      await logWorkout(mockReq, mockRes);

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('calls logUserAction with workout_logged', async () => {
      const mockUser = makeUser();
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.body = {
        workoutName: 'Pull Day',
        exercises: [
          { exerciseName: 'Pull-up', sets: [{ setNumber: 1, reps: 8, weight: 0 }] },
        ],
      };

      await logWorkout(mockReq, mockRes);

      expect(logUserAction).toHaveBeenCalledWith(
        mockReq.user.id,
        'workout_logged',
        expect.any(Object)
      );
    });
  });

  // ── getWorkouts ────────────────────────────────────────────────────────────

  describe('getWorkouts', () => {
    it('returns paginated workouts excluding soft-deleted', async () => {
      const w1 = makeWorkout({ workoutName: 'A' });
      const w2 = makeWorkout({ workoutName: 'B', deletedAt: new Date() });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([w1, w2]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getWorkouts(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.workouts).toHaveLength(1);
      expect(call.workouts[0].workoutName).toBe('A');
    });

    it('returns correct pagination shape', async () => {
      const workouts = makeSubdocArray(
        Array.from({ length: 3 }, (_, i) => makeWorkout({ workoutName: `W${i}` }))
      );
      const mockUser = makeUser({ workoutLogs: workouts });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.query = { page: '1', limit: '2' };

      await getWorkouts(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.pagination.totalWorkouts).toBe(3);
      expect(call.pagination.totalPages).toBe(2);
      expect(call.pagination.hasNextPage).toBe(true);
    });

    it('default sort (no param) puts oldest first', async () => {
      const older = makeWorkout({ workoutName: 'Old', date: new Date('2024-01-01') });
      const newer = makeWorkout({ workoutName: 'New', date: new Date('2024-06-01') });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([newer, older]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getWorkouts(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.workouts[0].workoutName).toBe('Old');
    });
  });

  // ── getWorkoutById ─────────────────────────────────────────────────────────

  describe('getWorkoutById', () => {
    it('throws ValidationError for invalid ObjectId', async () => {
      mockReq.params = { id: 'bad-id' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(getWorkoutById(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws NotFoundError when workout not found', async () => {
      const wid = new mongoose.Types.ObjectId();
      mockReq.params = { id: wid.toString() };
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(getWorkoutById(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws NotFoundError when workout is soft-deleted', async () => {
      const wid = new mongoose.Types.ObjectId();
      mockReq.params = { id: wid.toString() };
      const workout = makeWorkout({ _id: wid, deletedAt: new Date() });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([workout]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(getWorkoutById(mockReq, mockRes)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('returns workout for valid id', async () => {
      const wid = new mongoose.Types.ObjectId();
      mockReq.params = { id: wid.toString() };
      const workout = makeWorkout({ _id: wid });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([workout]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getWorkoutById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, workout });
    });
  });

  // ── deleteWorkout ──────────────────────────────────────────────────────────

  describe('deleteWorkout', () => {
    it('throws ValidationError for invalid ObjectId', async () => {
      mockReq.params = { id: 'not-valid' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(deleteWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws NotFoundError when workout not found', async () => {
      const wid = new mongoose.Types.ObjectId();
      mockReq.params = { id: wid.toString() };
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(deleteWorkout(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('soft-deletes workout, saves, calls logUserAction', async () => {
      const wid = new mongoose.Types.ObjectId();
      mockReq.params = { id: wid.toString() };
      const workout = makeWorkout({ _id: wid });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([workout]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await deleteWorkout(mockReq, mockRes);

      expect(workout.deletedAt).toBeInstanceOf(Date);
      expect(mockUser.save).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(
        mockReq.user.id,
        'workout_deleted',
        expect.any(Object)
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout deleted successfully',
      });
    });
  });

  // ── getExerciseProgress ────────────────────────────────────────────────────

  describe('getExerciseProgress', () => {
    it('returns zero-state when no sessions found', async () => {
      mockReq.params = { exerciseName: encodeURIComponent('Deadlift') };
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getExerciseProgress(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.data.sessions).toEqual([]);
      expect(call.data.maxWeight).toBe(0);
    });

    it('is case-insensitive when matching exercise names', async () => {
      mockReq.params = { exerciseName: 'bench press' };
      const workout = makeWorkout();
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([workout]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getExerciseProgress(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.data.sessions).toHaveLength(1);
    });

    it('computes maxWeight and totalReps correctly', async () => {
      mockReq.params = { exerciseName: 'Bench Press' };
      const workout = makeWorkout({
        exercises: [
          {
            exerciseName: 'Bench Press',
            sets: [
              { setNumber: 1, reps: 10, weight: 100, completed: true },
              { setNumber: 2, reps: 8, weight: 120, completed: true },
            ],
          },
        ],
      });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([workout]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getExerciseProgress(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.data.maxWeight).toBe(120);
      expect(call.data.totalReps).toBe(18);
    });
  });

  // ── getStatsSummary ────────────────────────────────────────────────────────

  describe('getStatsSummary', () => {
    it('returns zero-state when no active workouts', async () => {
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        stats: expect.objectContaining({
          totalWorkouts: 0,
          lastWorkout: null,
          mostTrainedExercise: null,
          weeklyVolume: 0,
          totalVolume: 0,
        }),
      });
    });

    it('computes totalWorkouts excluding soft-deleted', async () => {
      const w1 = makeWorkout({ totalVolume: 1000 });
      const w2 = makeWorkout({ totalVolume: 500, deletedAt: new Date() });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([w1, w2]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.totalWorkouts).toBe(1);
    });

    it('identifies mostTrainedExercise correctly', async () => {
      const w1 = makeWorkout({ exercises: [{ exerciseName: 'Squat', sets: [] }] });
      const w2 = makeWorkout({
        exercises: [
          { exerciseName: 'Squat', sets: [] },
          { exerciseName: 'Bench', sets: [] },
        ],
      });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([w1, w2]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.mostTrainedExercise).toBe('Squat');
    });

    it('computes weeklyVolume only from last 7 days', async () => {
      const recent = makeWorkout({ date: new Date(), totalVolume: 2000 });
      const old = makeWorkout({ date: new Date('2020-01-01'), totalVolume: 5000 });
      const mockUser = makeUser({ workoutLogs: makeSubdocArray([recent, old]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.weeklyVolume).toBe(2000);
    });
  });
});
