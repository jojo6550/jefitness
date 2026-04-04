const mongoose = require('mongoose');

const sanitizeHtml = require('sanitize-html');

const User = require('../models/User');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { logUserAction } = require('../services/logger');

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const nutritionController = {
  /**
   * Create a new meal log
   */
  logMeal: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { date, mealType, foods, notes } = req.body;

    if (!mealType || !VALID_MEAL_TYPES.includes(mealType)) {
      throw new ValidationError('mealType must be breakfast, lunch, dinner, or snack');
    }
    if (!foods || !Array.isArray(foods) || foods.length === 0) {
      throw new ValidationError('At least one food item is required');
    }

    const sanitizedFoods = foods.map((f, i) => {
      if (!f.foodName) {
        throw new ValidationError(`Food item ${i + 1} requires a foodName`);
      }
      if (f.calories === undefined || f.calories === null) {
        throw new ValidationError(`Food item ${i + 1} requires calories`);
      }
      return {
        foodName: sanitizeHtml(String(f.foodName), { allowedTags: [], allowedAttributes: {} }).substring(0, 200),
        calories: Math.max(0, Number(f.calories) || 0),
        protein:  Math.max(0, Number(f.protein)  || 0),
        carbs:    Math.max(0, Number(f.carbs)    || 0),
        fat:      Math.max(0, Number(f.fat)      || 0),
        quantity: Math.max(0.01, Number(f.quantity) || 1),
        unit:     ['g', 'ml', 'oz', 'serving'].includes(f.unit) ? f.unit : 'g',
      };
    });

    const totalCalories = sanitizedFoods.reduce((sum, f) => sum + f.calories, 0);

    const mealLog = {
      date: date ? new Date(date) : new Date(),
      mealType,
      foods: sanitizedFoods,
      totalCalories,
      notes: notes
        ? sanitizeHtml(String(notes), { allowedTags: [], allowedAttributes: {} }).substring(0, 500)
        : undefined,
    };

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    user.mealLogs.push(mealLog);
    await user.save();

    const createdLog = user.mealLogs[user.mealLogs.length - 1];
    logUserAction(userId, 'meal_logged', { mealType, totalCalories });

    res.status(201).json({ success: true, meal: createdLog });
  }),

  /**
   * Get meal logs with pagination and optional filters
   */
  getMeals: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const page      = parseInt(req.query.page)  || 1;
    const limit     = Math.min(parseInt(req.query.limit) || 20, 100);
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const { startDate, endDate, mealType } = req.query;

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    let meals = user.mealLogs.filter(log => !log.deletedAt);

    if (mealType && VALID_MEAL_TYPES.includes(mealType)) {
      meals = meals.filter(m => m.mealType === mealType);
    }
    if (startDate) {
      const start = new Date(startDate);
      meals = meals.filter(m => new Date(m.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      meals = meals.filter(m => new Date(m.date) <= end);
    }

    meals.sort((a, b) => sortOrder * (new Date(b.date) - new Date(a.date)));

    const total      = meals.length;
    const startIndex = (page - 1) * limit;
    const paginated  = meals.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      meals: paginated,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        totalMeals: total,
        hasNextPage: startIndex + limit < total,
        hasPrevPage: page > 1,
      },
    });
  }),

  /**
   * Get a single meal log by ID
   */
  getMealById: asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid meal ID');
    }

    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User');

    const meal = user.mealLogs.id(id);
    if (!meal || meal.deletedAt) throw new NotFoundError('Meal');

    res.json({ success: true, meal });
  }),

  /**
   * Soft-delete a meal log
   */
  deleteMeal: asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid meal ID');
    }

    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User');

    const meal = user.mealLogs.id(id);
    if (!meal || meal.deletedAt) throw new NotFoundError('Meal');

    meal.deletedAt = new Date();
    await user.save();

    logUserAction(req.user.id, 'meal_deleted', { mealId: id });
    res.json({ success: true, message: 'Meal deleted successfully' });
  }),

  /**
   * Get nutrition stats summary
   */
  getStatsSummary: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User');

    const active = user.mealLogs.filter(m => !m.deletedAt);

    if (active.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalMeals: 0,
          dailyAverageCalories: 0,
          last7DaysCalories: 0,
          topFoods: [],
          mealTypeBreakdown: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
          lastMeal: null,
        },
      });
    }

    // Group by date to compute daily averages
    const dayMap = {};
    active.forEach(m => {
      const day = new Date(m.date).toISOString().slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + m.totalCalories;
    });
    const uniqueDays = Object.keys(dayMap).length;
    const totalCals  = Object.values(dayMap).reduce((s, c) => s + c, 0);
    const dailyAverageCalories = uniqueDays > 0 ? Math.round(totalCals / uniqueDays) : 0;

    // Last 7 days calories
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7DaysCalories = active
      .filter(m => new Date(m.date) >= sevenDaysAgo)
      .reduce((s, m) => s + m.totalCalories, 0);

    // Top 5 foods by frequency
    const foodCount = {};
    active.forEach(m => m.foods.forEach(f => {
      foodCount[f.foodName] = (foodCount[f.foodName] || 0) + 1;
    }));
    const topFoods = Object.entries(foodCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Meal type breakdown
    const mealTypeBreakdown = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    active.forEach(m => { mealTypeBreakdown[m.mealType]++; });

    const sorted   = [...active].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastMeal = sorted[0];

    res.json({
      success: true,
      stats: {
        totalMeals: active.length,
        dailyAverageCalories,
        last7DaysCalories,
        topFoods,
        mealTypeBreakdown,
        lastMeal: {
          mealType: lastMeal.mealType,
          date: lastMeal.date,
          totalCalories: lastMeal.totalCalories,
        },
      },
    });
  }),

  /**
   * Get per-day calorie/macro totals for charting
   */
  getDailyTotals: asyncHandler(async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 90);

    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const active = user.mealLogs.filter(m => !m.deletedAt && new Date(m.date) >= cutoff);

    const dayMap = {};
    active.forEach(m => {
      const day = new Date(m.date).toISOString().slice(0, 10);
      if (!dayMap[day]) {
        dayMap[day] = { date: day, totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, mealCount: 0 };
      }
      dayMap[day].totalCalories += m.totalCalories;
      dayMap[day].mealCount++;
      m.foods.forEach(f => {
        dayMap[day].totalProtein += f.protein || 0;
        dayMap[day].totalCarbs   += f.carbs   || 0;
        dayMap[day].totalFat     += f.fat     || 0;
      });
    });

    const dailyTotals = Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        totalCalories: Math.round(d.totalCalories),
        totalProtein:  Math.round(d.totalProtein),
        totalCarbs:    Math.round(d.totalCarbs),
        totalFat:      Math.round(d.totalFat),
      }));

    res.json({ success: true, dailyTotals });
  }),
};

module.exports = nutritionController;
