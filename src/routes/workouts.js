const express = require('express');

const router = express.Router();
const workoutController = require('../controllers/workoutController');
const User = require('../models/User');
const { logger } = require('../services/logger');

/**
 * @swagger
 * /api/v1/workouts/log:
 *   post:
 *     summary: Create a new workout log
 *     tags: [Workouts]
 */
router.post('/log', workoutController.logWorkout);

/**
 * @swagger
 * /api/v1/workouts:
 *   get:
 *     summary: Get workout logs with pagination
 *     tags: [Workouts]
 */
router.get('/', workoutController.getWorkouts);

/**
 * @swagger
 * /api/v1/workouts/stats/summary:
 *   get:
 *     summary: Get workout statistics summary
 *     tags: [Workouts]
 */
router.get('/stats/summary', workoutController.getStatsSummary);

/**
 * @swagger
 * /api/v1/workouts/progress/{exerciseName}:
 *   get:
 *     summary: Get progress data for a specific exercise
 *     tags: [Workouts]
 */
router.get('/progress/:exerciseName', workoutController.getExerciseProgress);

/**
 * @swagger
 * /api/v1/workouts/{id}:
 *   get:
 *     summary: Get a single workout log by ID
 *     tags: [Workouts]
 */
router.get('/:id', workoutController.getWorkoutById);

/**
 * @swagger
 * /api/v1/workouts/{id}:
 *   delete:
 *     summary: Delete workout log
 *     tags: [Workouts]
 */
router.delete('/:id', workoutController.deleteWorkout);

// ── Workout Goals ─────────────────────────────────────────────────────────────

// GET /api/v1/workouts/goals - list the user's workout goals
router.get('/goals', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('workoutGoals');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, goals: user.workoutGoals || [] });
  } catch (err) {
    logger.error('Get workout goals error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/v1/workouts/goals - create a new workout goal
router.post('/goals', async (req, res) => {
  try {
    const { exercise, targetWeight, targetDate } = req.body;
    if (!exercise || targetWeight === undefined) {
      return res.status(400).json({ success: false, error: 'exercise and targetWeight are required' });
    }
    if (typeof targetWeight !== 'number' || targetWeight < 0) {
      return res.status(400).json({ success: false, error: 'targetWeight must be a non-negative number' });
    }
    const goal = { exercise: String(exercise).trim(), targetWeight, createdAt: new Date() };
    if (targetDate) goal.targetDate = new Date(targetDate);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $push: { workoutGoals: goal } },
      { new: true, runValidators: false }
    ).select('workoutGoals');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.status(201).json({ success: true, goals: user.workoutGoals });
  } catch (err) {
    logger.error('Create workout goal error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PUT /api/v1/workouts/goals/:goalId/achieve - mark a goal as achieved
router.put('/goals/:goalId/achieve', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, 'workoutGoals._id': req.params.goalId },
      {
        $set: {
          'workoutGoals.$.achieved': true,
          'workoutGoals.$.achievedAt': new Date(),
        },
      },
      { new: true }
    ).select('workoutGoals');
    if (!user) return res.status(404).json({ success: false, error: 'Goal not found' });
    res.json({ success: true, goals: user.workoutGoals });
  } catch (err) {
    logger.error('Achieve workout goal error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/v1/workouts/goals/:goalId - delete a goal
router.delete('/goals/:goalId', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { workoutGoals: { _id: req.params.goalId } } },
      { new: true }
    ).select('workoutGoals');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'Goal deleted', goals: user.workoutGoals });
  } catch (err) {
    logger.error('Delete workout goal error', { userId: req.user.id, error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
