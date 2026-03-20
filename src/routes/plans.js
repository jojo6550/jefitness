const express = require('express');
const StripePlan = require('../models/StripePlan');
const { auth, protectedRoute } = require('../middleware'); // Optional auth

const router = express.Router();

// GET /api/v1/plans - Frontend catalog query (no auth needed for public catalog)
router.get('/', async (req, res) => {
  try {
    const { lookupKey, active = 'true', sort = 'unitAmount' } = req.query;
    
    const filter = { active: active === 'true' };
    if (lookupKey) filter.lookupKey = lookupKey;
    
    const plans = await StripePlan.find(filter)
      .sort(sort === 'name' ? 'name' : 'unitAmount')
      .lean();

    // Format for frontend
    const formatted = plans.map(plan => ({
      ...plan,
      displayPrice: `$${(plan.unitAmount / 100).toFixed(2)}`,
      intervalDisplay: `${plan.interval}${plan.intervalCount > 1 ? ` x${plan.intervalCount}` : ''}`
    }));

    res.json({
      success: true,
      count: formatted.length,
      plans: formatted
    });
  } catch (error) {
    console.error('Plans route error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// GET /api/v1/plans/:lookupKey - Single plan by lookup_key
router.get('/:lookupKey', async (req, res) => {
  try {
    const plan = await StripePlan.findOne({ 
      lookupKey: req.params.lookupKey, 
      active: true 
    }).lean();

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({
      success: true,
      plan: {
        ...plan,
        displayPrice: `$${(plan.unitAmount / 100).toFixed(2)}`
      }
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
