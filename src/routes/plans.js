/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: Subscription plan catalog (public — no auth required)
 */

const express = require('express');

const { logger } = require('../services/logger');
const StripePlan = require('../models/StripePlan');
// Removed unused middleware imports (public route - no auth needed)

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
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 plans:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Server error
 */
// GET /api/v1/plans - Frontend catalog query (no auth needed for public catalog)
router.get('/', async (req, res) => {
  try {
    const { lookupKey, active = 'true', sort = 'interval' } = req.query;

    const matchFilter = { active: active === 'true' };
    if (lookupKey) matchFilter.lookupKey = lookupKey;

    // Compute monthsEquivalent for interval sorting (1m=1,3m=3,...,12m=12)
    const pipeline = [
      { $match: matchFilter },
      {
        $addFields: {
          monthsEquivalent: {
            $cond: {
              if: { $eq: ['$interval', 'year'] },
              then: { $multiply: ['$intervalCount', 12] },
              else: '$intervalCount',
            },
          },
        },
      },
    ];

    // Determine sort stage
    let sortStage;
    switch (sort) {
      case 'name':
        sortStage = { $sort: { name: 1 } };
        break;
      case 'unitAmount':
        sortStage = { $sort: { unitAmount: 1 } };
        break;
      case 'interval':
      default:
        sortStage = { $sort: { monthsEquivalent: 1, unitAmount: 1 } }; // shortest first, then cheapest
        break;
    }
    pipeline.push(sortStage);

    const plans = await StripePlan.aggregate(pipeline);

    // Format for frontend (aggregate docs need manual id conversion)
    const formatted = plans.map(plan => ({
      ...plan,
      _id: plan._id?.toString(), // Ensure string ID for frontend
      displayPrice: `$${(plan.unitAmount / 100).toFixed(2)}`,
      intervalDisplay: `${plan.interval}${plan.intervalCount > 1 ? ` x${plan.intervalCount}` : ''}`,
    }));

    res.json({
      success: true,
      count: formatted.length,
      plans: formatted,
    });
  } catch (error) {
    logger.error('Plans route error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

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
 *         description: Stripe price lookup key (e.g. "1-month", "12-month")
 *     responses:
 *       200:
 *         description: Plan details
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
// GET /api/v1/plans/:lookupKey - Single plan by lookup_key
router.get('/:lookupKey', async (req, res) => {
  try {
    const plan = await StripePlan.findOne({
      lookupKey: req.params.lookupKey,
      active: true,
    }).lean();

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({
      success: true,
      plan: {
        ...plan,
        displayPrice: `$${(plan.unitAmount / 100).toFixed(2)}`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;

// USAGE: In src/server.js main app:
// app.use('/api/v1/plans', require('./routes/plans'));

// Frontend example:
// const plans = await fetch('/api/v1/plans').then(r => r.json());
// const proPlan = await fetch('/api/v1/plans/pro-monthly').then(r => r.json());
