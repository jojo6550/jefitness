/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: Subscription plan catalog (public — no auth required)
 */

const express = require('express');

const planController = require('../controllers/planController');

const router = express.Router();

/**
 * @swagger
 * /plans:
 *   get:
 *     summary: Get subscription plan catalog (public, no auth required)
 *     tags: [Plans]
 *     parameters:
 *       - in: query
 *         name: lookupKey
 *         schema:
 *           type: string
 *         description: Filter by a specific plan lookup key
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [interval, name, unitAmount]
 *           default: interval
 */
router.get('/', planController.getAllPlans);

/**
 * @swagger
 * /plans/{lookupKey}:
 *   get:
 *     summary: Get a single active plan by its lookup key (public)
 *     tags: [Plans]
 *     parameters:
 *       - in: path
 *         name: lookupKey
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:lookupKey', planController.getPlanByLookupKey);

module.exports = router;
