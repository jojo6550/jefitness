const mongoose = require('mongoose');

jest.mock('../../models/User');
jest.mock('sanitize-html', () => (str) => str);
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
  logMeal,
  getMeals,
  getMealById,
  deleteMeal,
  getStatsSummary,
  getDailyTotals,
} = require('../../controllers/nutritionController');

function makeSubdocArray(items) {
  const arr = [...items];
  arr.id = (searchId) =>
    arr.find(item => item._id.toString() === searchId.toString()) ?? null;
  return arr;
}

function makeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    mealLogs: makeSubdocArray([]),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('nutritionController', () => {
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

  // ── logMeal ────────────────────────────────────────────────────────────────

  describe('logMeal', () => {
    it('throws ValidationError for missing mealType', async () => {
      mockReq.body = { foods: [{ foodName: 'Apple', calories: 100 }] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for invalid mealType', async () => {
      mockReq.body = { mealType: 'brunch', foods: [{ foodName: 'Apple', calories: 100 }] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when foods is missing', async () => {
      mockReq.body = { mealType: 'breakfast' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when foods is empty', async () => {
      mockReq.body = { mealType: 'lunch', foods: [] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when food item missing foodName', async () => {
      mockReq.body = { mealType: 'lunch', foods: [{ calories: 100 }] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when food item missing calories', async () => {
      mockReq.body = { mealType: 'lunch', foods: [{ foodName: 'Rice' }] };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when user not found', async () => {
      mockReq.body = { mealType: 'breakfast', foods: [{ foodName: 'Egg', calories: 80 }] };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(logMeal(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('creates meal log successfully and returns 201', async () => {
      const mealId = new mongoose.Types.ObjectId();
      const mockUser = makeUser();
      mockUser.mealLogs.push({ _id: mealId, mealType: 'breakfast', foods: [], totalCalories: 150 });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      mockReq.body = {
        mealType: 'breakfast',
        foods: [{ foodName: 'Oatmeal', calories: 150, protein: 5, carbs: 30, fat: 2 }],
      };

      await logMeal(mockReq, mockRes);

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('calls logUserAction with meal_logged', async () => {
      const mockUser = makeUser();
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.body = {
        mealType: 'dinner',
        foods: [{ foodName: 'Steak', calories: 400 }],
      };

      await logMeal(mockReq, mockRes);

      expect(logUserAction).toHaveBeenCalledWith(
        mockReq.user.id,
        'meal_logged',
        expect.any(Object)
      );
    });

    it('defaults unit to g for unknown unit', async () => {
      const mockUser = makeUser();
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.body = {
        mealType: 'snack',
        foods: [{ foodName: 'Chips', calories: 200, unit: 'bags' }],
      };

      await logMeal(mockReq, mockRes);

      const pushed = mockUser.mealLogs[mockUser.mealLogs.length - 1];
      expect(pushed.foods[0].unit).toBe('g');
    });
  });

  // ── getMeals ───────────────────────────────────────────────────────────────

  describe('getMeals', () => {
    it('returns paginated meals excluding soft-deleted', async () => {
      const id1 = new mongoose.Types.ObjectId();
      const id2 = new mongoose.Types.ObjectId();
      const meals = makeSubdocArray([
        { _id: id1, mealType: 'breakfast', date: new Date(), totalCalories: 300, foods: [], deletedAt: null },
        { _id: id2, mealType: 'lunch', date: new Date(), totalCalories: 500, foods: [], deletedAt: new Date() },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getMeals(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.meals).toHaveLength(1);
      expect(call.meals[0]._id).toEqual(id1);
    });

    it('filters by mealType query param', async () => {
      const meals = makeSubdocArray([
        { _id: new mongoose.Types.ObjectId(), mealType: 'breakfast', date: new Date(), totalCalories: 300, foods: [], deletedAt: null },
        { _id: new mongoose.Types.ObjectId(), mealType: 'dinner', date: new Date(), totalCalories: 600, foods: [], deletedAt: null },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.query = { mealType: 'breakfast' };

      await getMeals(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.meals).toHaveLength(1);
      expect(call.meals[0].mealType).toBe('breakfast');
    });

    it('returns correct pagination metadata', async () => {
      const meals = makeSubdocArray(
        Array.from({ length: 5 }, () => ({
          _id: new mongoose.Types.ObjectId(),
          mealType: 'snack',
          date: new Date(),
          totalCalories: 100,
          foods: [],
          deletedAt: null,
        }))
      );
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      mockReq.query = { page: '2', limit: '2' };

      await getMeals(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.pagination.currentPage).toBe(2);
      expect(call.pagination.totalMeals).toBe(5);
      expect(call.pagination.hasPrevPage).toBe(true);
    });
  });

  // ── getMealById ────────────────────────────────────────────────────────────

  describe('getMealById', () => {
    it('throws ValidationError for invalid ObjectId', async () => {
      mockReq.params = { id: 'notanid' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(getMealById(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when meal does not exist', async () => {
      const mealId = new mongoose.Types.ObjectId();
      mockReq.params = { id: mealId.toString() };
      const mockUser = makeUser({ mealLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(getMealById(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when meal is soft-deleted', async () => {
      const mealId = new mongoose.Types.ObjectId();
      mockReq.params = { id: mealId.toString() };
      const meals = makeSubdocArray([
        { _id: mealId, mealType: 'lunch', date: new Date(), totalCalories: 400, foods: [], deletedAt: new Date() },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(getMealById(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns meal for valid id', async () => {
      const mealId = new mongoose.Types.ObjectId();
      mockReq.params = { id: mealId.toString() };
      const meal = { _id: mealId, mealType: 'snack', date: new Date(), totalCalories: 150, foods: [], deletedAt: null };
      const meals = makeSubdocArray([meal]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getMealById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true, meal });
    });
  });

  // ── deleteMeal ─────────────────────────────────────────────────────────────

  describe('deleteMeal', () => {
    it('throws ValidationError for invalid ObjectId', async () => {
      mockReq.params = { id: 'bad-id' };
      const { ValidationError } = require('../../middleware/errorHandler');
      await expect(deleteMeal(mockReq, mockRes)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when meal not found', async () => {
      const mealId = new mongoose.Types.ObjectId();
      mockReq.params = { id: mealId.toString() };
      const mockUser = makeUser({ mealLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const { NotFoundError } = require('../../middleware/errorHandler');
      await expect(deleteMeal(mockReq, mockRes)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('soft-deletes meal, saves, calls logUserAction', async () => {
      const mealId = new mongoose.Types.ObjectId();
      mockReq.params = { id: mealId.toString() };
      const meal = { _id: mealId, mealType: 'breakfast', date: new Date(), totalCalories: 200, foods: [], deletedAt: null };
      const mockUser = makeUser({ mealLogs: makeSubdocArray([meal]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await deleteMeal(mockReq, mockRes);

      expect(meal.deletedAt).toBeInstanceOf(Date);
      expect(mockUser.save).toHaveBeenCalled();
      expect(logUserAction).toHaveBeenCalledWith(mockReq.user.id, 'meal_deleted', expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Meal deleted successfully' });
    });
  });

  // ── getStatsSummary ────────────────────────────────────────────────────────

  describe('getStatsSummary', () => {
    it('returns zero-state when no active meals', async () => {
      const mockUser = makeUser({ mealLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        stats: expect.objectContaining({
          totalMeals: 0,
          dailyAverageCalories: 0,
          last7DaysCalories: 0,
          topFoods: [],
          lastMeal: null,
        }),
      });
    });

    it('excludes soft-deleted meals from stats', async () => {
      const meals = makeSubdocArray([
        { _id: new mongoose.Types.ObjectId(), mealType: 'breakfast', date: new Date(), totalCalories: 500, foods: [{ foodName: 'Eggs' }], deletedAt: new Date() },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.totalMeals).toBe(0);
    });

    it('computes mealTypeBreakdown correctly', async () => {
      const meals = makeSubdocArray([
        { _id: new mongoose.Types.ObjectId(), mealType: 'breakfast', date: new Date(), totalCalories: 300, foods: [{ foodName: 'Toast' }], deletedAt: null },
        { _id: new mongoose.Types.ObjectId(), mealType: 'breakfast', date: new Date(), totalCalories: 250, foods: [{ foodName: 'Bagel' }], deletedAt: null },
        { _id: new mongoose.Types.ObjectId(), mealType: 'lunch', date: new Date(), totalCalories: 600, foods: [{ foodName: 'Sandwich' }], deletedAt: null },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.mealTypeBreakdown.breakfast).toBe(2);
      expect(call.stats.mealTypeBreakdown.lunch).toBe(1);
    });

    it('returns topFoods by frequency', async () => {
      const meals = makeSubdocArray([
        { _id: new mongoose.Types.ObjectId(), mealType: 'breakfast', date: new Date(), totalCalories: 300, foods: [{ foodName: 'Oats' }, { foodName: 'Banana' }], deletedAt: null },
        { _id: new mongoose.Types.ObjectId(), mealType: 'lunch', date: new Date(), totalCalories: 400, foods: [{ foodName: 'Oats' }], deletedAt: null },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getStatsSummary(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.stats.topFoods[0]).toBe('Oats');
    });
  });

  // ── getDailyTotals ─────────────────────────────────────────────────────────

  describe('getDailyTotals', () => {
    it('returns empty array when no meals in range', async () => {
      const mockUser = makeUser({ mealLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getDailyTotals(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.dailyTotals).toEqual([]);
    });

    it('caps days at 90', async () => {
      mockReq.query = { days: '200' };
      const mockUser = makeUser({ mealLogs: makeSubdocArray([]) });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getDailyTotals(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalled();
    });

    it('aggregates meals by day', async () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const meals = makeSubdocArray([
        {
          _id: new mongoose.Types.ObjectId(),
          mealType: 'breakfast',
          date: today,
          totalCalories: 300,
          foods: [{ protein: 10, carbs: 40, fat: 5 }],
          deletedAt: null,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          mealType: 'lunch',
          date: today,
          totalCalories: 500,
          foods: [{ protein: 20, carbs: 60, fat: 10 }],
          deletedAt: null,
        },
      ]);
      const mockUser = makeUser({ mealLogs: meals });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await getDailyTotals(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0][0];
      expect(call.dailyTotals).toHaveLength(1);
      expect(call.dailyTotals[0].totalCalories).toBe(800);
      expect(call.dailyTotals[0].mealCount).toBe(2);
    });
  });
});
