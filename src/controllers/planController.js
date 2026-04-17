const { logger } = require('../services/logger');
const StripePlan = require('../models/StripePlan');

const planController = {
  /**
   * GET /api/v1/plans — public plan catalog query.
   */
  getAllPlans: async (req, res) => {
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
          sortStage = { $sort: { monthsEquivalent: 1, unitAmount: 1 } };
          break;
      }
      pipeline.push(sortStage);

      const plans = await StripePlan.aggregate(pipeline);

      const formatted = plans.map(plan => ({
        ...plan,
        _id: plan._id?.toString(),
        displayPrice: `$${(plan.unitAmount / 100).toFixed(2)}`,
        intervalDisplay: `${plan.interval}${plan.intervalCount > 1 ? ` x${plan.intervalCount}` : ''}`,
      }));

      res.json({ success: true, count: formatted.length, plans: formatted });
    } catch (error) {
      logger.error('Plans route error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to fetch plans' });
    }
  },

  /**
   * GET /api/v1/plans/:lookupKey — single active plan by lookup key.
   */
  getPlanByLookupKey: async (req, res) => {
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
    } catch (err) {
      logger.error('Plan lookup error', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  },
};

module.exports = planController;
