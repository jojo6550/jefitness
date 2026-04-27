const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { logger } = require('../services/logger');
const { daysLeftUntil, addDays } = require('../utils/dateUtils');
const { PLANS } = require('../config/subscriptionConstants');

async function getMonthlyRevenue(req, res) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const activeSubs = await Subscription.find({
      active: true,
      purchasedAt: { $gte: monthStart, $lte: monthEnd },
    }).lean();

    const revenue = activeSubs.reduce((sum, sub) => sum + (sub.amount || 0), 0);
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    res.json({ revenue, currency: 'USD', month: monthLabel });
  } catch (err) {
    logger.error('Failed to calculate monthly revenue', { error: err.message });
    res.status(500).json({ msg: 'Failed to calculate revenue' });
  }
}

/**
 * DELETE /api/v1/admin/clients/bulk
 * Deletes up to 50 users and their subscriptions.
 * Body: { userIds: string[] }
 */
async function bulkDeleteClients(req, res) {
  try {
    const { userIds } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ msg: 'userIds must be an array' });
    }
    if (userIds.length === 0) {
      return res.status(400).json({ msg: 'userIds must not be empty' });
    }
    if (userIds.length > 50) {
      return res.status(400).json({ msg: 'Cannot delete more than 50 clients at once' });
    }
    // Prevent admin from deleting their own account
    if (userIds.includes(adminId)) {
      return res.status(400).json({ msg: 'Cannot delete your own account' });
    }

    // Only delete non-admin users
    const users = await User.find({
      _id: { $in: userIds },
      role: { $ne: 'admin' },
    }).lean();
    const safeIds = users.map(u => u._id.toString());

    await Subscription.deleteMany({ userId: { $in: safeIds } });
    await User.deleteMany({ _id: { $in: safeIds } });

    logger.logAdminAction(
      'bulk_delete_clients',
      adminId,
      {
        deletedCount: safeIds.length,
        userIds: safeIds,
      },
      req
    );

    res.json({
      msg: `Deleted ${safeIds.length} client(s)`,
      deletedCount: safeIds.length,
    });
  } catch (err) {
    logger.error('Bulk delete failed', { error: err.message });
    res.status(500).json({ msg: 'Bulk delete failed' });
  }
}

async function createSubscription(req, res) {
  try {
    const { userId, planKey, overrideDays } = req.body;
    const adminId = req.user.id;

    if (!planKey || !PLANS[planKey]) {
      const validPlans = Object.keys(PLANS).join(', ');
      return res.status(400).json({ msg: `Invalid planKey. Must be one of: ${validPlans}` });
    }

    if (!userId) return res.status(400).json({ msg: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ msg: 'Cannot add subscription to admin account' });

    const now = new Date();
    const planData = PLANS[planKey];
    const days = overrideDays || planData.durationDays;
    const expiresAt = addDays(now, days);

    const existingSub = await Subscription.findOne({ userId });

    let subscription;
    if (existingSub) {
      subscription = await Subscription.findByIdAndUpdate(
        existingSub._id,
        {
          $set: {
            active: true,
            expiresAt,
            amount: planData.price,
            currency: planData.currency,
            purchasedAt: now,
          },
        },
        { new: true }
      );
    } else {
      subscription = await Subscription.create({
        userId: user._id,
        active: true,
        expiresAt,
        amount: planData.price,
        currency: planData.currency,
        purchasedAt: now,
      });
    }

    logger.logAdminAction(
      'subscription_created',
      adminId,
      {
        userId,
        planKey,
        overrideDays: overrideDays || null,
        expiresAt: expiresAt.toISOString(),
      },
      req
    );

    res.json({
      msg: 'Subscription created successfully',
      subscription: {
        planKey,
        active: true,
        expiresAt,
        daysLeft: daysLeftUntil(expiresAt),
      },
    });
  } catch (err) {
    logger.error('Admin subscription creation failed', { error: err.message });
    res.status(500).json({ msg: 'Failed to create subscription' });
  }
}

async function getClientProfile(req, res) {
  try {
    const { id } = req.params;

    const [user, subscription] = await Promise.all([
      User.findById(id)
        .select(
          '-password -tokenVersion -emailVerificationToken -emailVerificationExpires -passwordResetToken -resetPasswordExpires -twoFactorSecret -twoFactorBackupCodes'
        )
        .lean(),
      Subscription.findOne({ userId: id }).lean(),
    ]);

    if (!user) return res.status(404).json({ msg: 'Client not found' });
    if (user.role === 'admin') return res.status(403).json({ msg: 'Cannot view admin accounts' });

    res.json({ client: { ...user, subscription: subscription || null } });
  } catch (err) {
    logger.error('Failed to fetch client profile', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch client profile' });
  }
}

async function extendSubscription(req, res, next) {
  try {
    const { id: subscriptionId } = req.params;
    const { daysToAdd } = req.body;
    const adminId = req.user.id;

    if (!daysToAdd || !Number.isInteger(daysToAdd) || daysToAdd <= 0) {
      return res.status(400).json({ error: 'daysToAdd must be positive integer' });
    }

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

    const newExpiresAt = addDays(subscription.expiresAt, daysToAdd);

    await Subscription.findByIdAndUpdate(subscriptionId, { $set: { expiresAt: newExpiresAt } });

    logger.logAdminAction(
      'subscription_extended',
      adminId,
      { subscriptionId: subscriptionId.toString(), daysToAdd, newExpiresAt: newExpiresAt.toISOString() },
      req
    );

    res.json({
      message: `Extended by ${daysToAdd} days`,
      expiresAt: newExpiresAt,
      daysLeft: daysLeftUntil(newExpiresAt),
    });
  } catch (error) {
    logger.error('Failed to extend subscription', { error: error.message });
    next(error);
  }
}

module.exports = {
  getMonthlyRevenue,
  bulkDeleteClients,
  createSubscription,
  getClientProfile,
  extendSubscription,
};
