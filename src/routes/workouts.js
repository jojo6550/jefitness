const express = require('express');

const router = express.Router();
const workoutController = require('../controllers/workoutController');

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

module.exports = router;
