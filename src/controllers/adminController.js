const User = require('../models/User');
const Subscription = require('../models/Subscription');
const StripePlan = require('../models/StripePlan');
const { logger } = require('../services/logger');
const { daysLeftUntil, addMonths, addYears } = require('../utils/dateUtils');

let _stripeClient = null;
function getStripeClient() {
  if (!_stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripeClient;
}

/**
 * GET /api/v1/admin/revenue
 * Total amount of active subs this month - updated for new status
 */
async function getMonthlyRevenue(req, res) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const activeSubs = await Subscription.find({
      status: 'active',
      currentPeriodStart: { $gte: monthStart, $lte: monthEnd },
    }).lean();

    const revenue = activeSubs.reduce((sum, sub) => sum + (sub.amount || 0), 0);
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    res.json({ revenue, currency: 'jmd', month: monthLabel });
  } catch (err) {
    logger.error('Revenue calculation failed', { error: err.message });
    res.status(500).json({ msg: 'Failed to calculate revenue' });
  }
}

/**
 * DELETE /api/v1/admin/clients/bulk - UNCHANGED
 */
async function bulkDeleteClients(req, res) {
  try {
    const { userIds } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 50 || userIds.includes(adminId)) {
      return res.status(400).json({ msg: 'Invalid userIds' });
    }

    const users = await User.find({ _id: { $in: userIds }, role: { $ne: 'admin' } }).lean();
    const safeIds = users.map(u => u._id.toString());

    await Subscription.deleteMany({ userId: { $in: safeIds } });
    await User.deleteMany({ _id: { $in: safeIds } });

    logger.logAdminAction('bulk_delete_clients', adminId, { deletedCount: safeIds.length, userIds: safeIds });

    res.json({ msg: `Deleted ${safeIds.length} client(s)`, deletedCount: safeIds.length });
  } catch (err) {
    logger.error('Bulk delete failed', { error: err.message });
    res.status(500).json({ msg: 'Bulk delete failed' });
  }
}

/**
 * POST /api/v1/admin/subscriptions
 * Admin creates subscription w/ optional overrideDays → overrideEndDate
 * Upserts single sub doc per user
 */
async function createSubscription(req, res) {
  let stripeSub = null;
  try {
    const { userId, planKey, overrideDays } = req.body;
    const adminId = req.user.id;

    const validPlans = ['1-month', '3-month', '6-month', '12-month'];
    if (!planKey || !validPlans.includes(planKey)) {
      return res.status(400).json({ msg: 'Invalid planKey' });
    }

    const user = await User.findById(userId);
    if (!user || user.role === 'admin') return res.status(400).json({ msg: 'Invalid user' });

    const intervalMap = {
      '1-month': { interval: 'month', intervalCount: 1 },
      '3-month': { interval: 'month', intervalCount: 3 },
      '6-month': { interval: 'month', intervalCount: 6 },
      '12-month': { interval: 'year', intervalCount: 1 },
    };
    const plan = await StripePlan.findOne({
      active: true,
      interval: intervalMap[planKey].interval,
      intervalCount: intervalMap[planKey].intervalCount,
    }).lean();

    if (!plan) return res.status(400).json({ msg: `No plan for ${planKey}` });

    // Ensure Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await getStripeClient().customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user._id.toString() },
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    } else {
      try {
        await getStripeClient().customers.retrieve(stripeCustomerId);
      } catch (custErr) {
        if (custErr.code === 'resource_missing') {
          const customer = await getStripeClient().customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            metadata: { userId: user._id.toString() },
          });
          stripeCustomerId = customer.id;
          user.stripeCustomerId = stripeCustomerId;
          await user.save();
        } else throw custErr;
      }
    }

    // Calculate end date
    const now = new Date();
    let periodEnd;
    if (overrideDays !== undefined) {
      periodEnd = new Date(now.getTime() + parseInt(overrideDays, 10) * 24 * 60 * 60 * 1000);
    } else {
      const planIntervalMap = {
        '1-month': () => addMonths(now, 1),
        '3-month': () => addMonths(now, 3),
        '6-month': () => addMonths(now, 6),
        '12-month': () => addYears(now, 1),
      };
      periodEnd = planIntervalMap[planKey]();
    }

    // Cancel existing Stripe sub if any
    const existingSub = await Subscription.findOne({ userId });
    if (existingSub?.stripeSubscriptionId) {
      try {
        await getStripeClient().subscriptions.cancel(existingSub.stripeSubscriptionId);
      } catch (cancelErr) {
        logger.error('Cancel existing failed:', cancelErr.message);
      }
    }

    // Create new Stripe sub with trial_end
    stripeSub = await getStripeClient().subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      trial_end: Math.floor(periodEnd.getTime() / 1000),
      metadata: { adminCreated: 'true', adminId: adminId.toString(), userId: userId.toString() },
    });

    // UPSERT single sub doc by userId
    const updatedSub = await Subscription.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          stripeCustomerId,
          stripeSubscriptionId: stripeSub.id,
          plan: planKey,
          stripePriceId: plan.stripePriceId,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          overrideEndDate: overrideDays !== undefined ? periodEnd : null,
          status: 'active',
          amount: plan.unitAmount,
          currency: plan.currency || 'jmd',
          billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test',
        },
        $push: {
          statusHistory: { status: 'active', changedAt: new Date(), reason: 'Admin created' },
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await User.findByIdAndUpdate(user._id, { $set: { subscriptionStatus: 'active' } });

    logger.logAdminAction('subscription_created', adminId, {
      userId,
      planKey,
      overrideDays: overrideDays !== undefined ? parseInt(overrideDays, 10) : null,
      stripeSubscriptionId: stripeSub.id,
      periodEnd: periodEnd.toISOString(),
    });

    res.json({
      msg: 'Subscription created',
      subscription: {
        plan: planKey,
        status: 'active',
        currentPeriodEnd: updatedSub.currentPeriodEnd,
        overrideEndDate: updatedSub.overrideEndDate,
        daysLeft: daysLeftUntil(updatedSub.overrideEndDate || updatedSub.currentPeriodEnd),
      },
    });
  } catch (err) {
    logger.error('Admin subscription create failed', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Failed to create subscription' });
  }
}

/**
 * GET /api/v1/admin/clients/:id - updated status query
 */
async function getClientProfile(req, res) {
  try {
    const { id } = req.params;

    const [user, subscription] = await Promise.all([
      User.findById(id).select('-password -tokenVersion -emailVerificationToken -emailVerificationExpires -passwordResetToken -resetPasswordExpires -twoFactorSecret -twoFactorBackupCodes').lean(),
      Subscription.findOne({ userId: id, status: { $in: ['active', 'trialing'] } }).lean(),
    ]);

    if (!user) return res.status(404).json({ msg: 'Client not found' });
    if (user.role === 'admin') return res.status(403).json({ msg: 'Cannot view admin' });

    res.json({ client: { ...user, subscription: subscription || null } });
  } catch (err) {
    logger.error('Client profile fetch failed', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch profile' });
  }
}

module.exports = { getMonthlyRevenue, bulkDeleteClients, createSubscription, getClientProfile };

