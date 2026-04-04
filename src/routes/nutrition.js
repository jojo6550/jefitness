const express = require('express');

const router = express.Router();
const nutritionController = require('../controllers/nutritionController');

/**
 * @swagger
 * /api/v1/nutrition/log:
 *   post:
 *     summary: Create a new meal log
 *     tags: [Nutrition]
 */
router.post('/log', nutritionController.logMeal);

/**
 * @swagger
 * /api/v1/nutrition:
 *   get:
 *     summary: Get meal logs with pagination and optional filters
 *     tags: [Nutrition]
 */
router.get('/', nutritionController.getMeals);

/**
 * @swagger
 * /api/v1/nutrition/stats/summary:
 *   get:
 *     summary: Get nutrition statistics summary
 *     tags: [Nutrition]
 */
router.get('/stats/summary', nutritionController.getStatsSummary);

/**
 * @swagger
 * /api/v1/nutrition/daily:
 *   get:
 *     summary: Get per-day calorie and macro totals for charting
 *     tags: [Nutrition]
 */
router.get('/daily', nutritionController.getDailyTotals);

/**
 * @swagger
 * /api/v1/nutrition/{id}:
 *   get:
 *     summary: Get a single meal log by ID
 *     tags: [Nutrition]
 */
router.get('/:id', nutritionController.getMealById);

/**
 * @swagger
 * /api/v1/nutrition/{id}:
 *   delete:
 *     summary: Delete a meal log (soft delete)
 *     tags: [Nutrition]
 */
router.delete('/:id', nutritionController.deleteMeal);

module.exports = router;
