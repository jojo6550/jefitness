const User = require('../models/User');
const subscriptionService = require('../services/subscriptionService');
const StripePlan = require('../models/StripePlan');
const stripeService = require('../services/stripe');
const { logger } = require('../services/logger');
const { daysLeftUntil, addMonths, addYears } = require('../utils/dateUtils');

/**
 * GET /api/v1/admin/revenue
 * Count active subs this month (service defines "active")
 */
async function getMonthlyRevenue(req, res) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Active = hasActiveAccess() as of monthStart
    const activeSubs = await subscriptionService.getOrCreateSubscription.aggregate([
      { $addFields: { 
          monthActive: { 
            $and: [
              { $eq: ['$state', 'active'] },
              { $gte: ['$currentPeriodEnd', monthStart] }
            ]
          }
        }
      },
      { $match: { monthActive: true } },
      { $count: 'activeCount' }
    ]);

    const count = activeSubs[0]?.activeCount || 0;
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    res.json({ 
      activeSubs: count, 
      period: monthLabel,
      currency: 'jmd' 
    });
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

    // Service handles subscription cleanup
    await subscriptionService.getOrCreateSubscription.deleteMany({ userId: { $in: safeIds } });
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
 * Admin sets state + periodEnd via service (simplified, optional Stripe)
 */
async function createSubscription(req, res) {
  try {
    const { userId, state = 'active', periodEnd, stripeCustomerId = '', stripeSubscriptionId = '' } = req.body;
    const adminId = req.user.id;

    if (!userId) return res.status(400).json({ msg: 'userId required' });

    const user = await User.findById(userId);
    if (!user || user.role === 'admin') return res.status(400).json({ msg: 'Invalid user' });

    const subscription = await subscriptionService.setSubscriptionState(
      userId, 
      state, 
      new Date(periodEnd)
    );

    logger.logAdminAction('admin_subscription_set', adminId, {
      userId,
      state,
      periodEnd: subscription.currentPeriodEnd.toISOString(),
      stripeCustomerId,
      stripeSubscriptionId
    });

    res.json({
      msg: 'Subscription updated',
      subscription: {
        state: subscription.state,
        currentPeriodEnd: subscription.currentPeriodEnd,
        daysLeft: daysLeftUntil(subscription.currentPeriodEnd),
        hasAccess: subscriptionService.hasActiveAccess(subscription)
      },
    });
  } catch (err) {
    logger.error('Admin subscription set failed', { error: err.message });
    res.status(500).json({ msg: 'Failed to update subscription' });
  }
}

/**
 * GET /api/v1/admin/clients/:id
 */
async function getClientProfile(req, res) {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password -tokenVersion -emailVerificationToken -emailVerificationExpires -passwordResetToken -resetPasswordExpires -twoFactorSecret -twoFactorBackupCodes')
      .lean();

    if (!user) return res.status(404).json({ msg: 'Client not found' });
    if (user.role === 'admin') return res.status(403).json({ msg: 'Cannot view admin' });

    // Service provides subscription info + access status
    const subscription = await subscriptionService.getOrCreateSubscription(id);
    await subscriptionService.checkAndHandleExpiration(subscription);

    res.json({ 
      client: { 
        ...user, 
        subscription: {
          state: subscription.state,
          expiresAt: subscription.currentPeriodEnd,
          hasAccess: subscriptionService.hasActiveAccess(subscription),
          daysLeft: daysLeftUntil(subscription.currentPeriodEnd)
        }
      } 
    });
  } catch (err) {
    logger.error('Client profile fetch failed', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch profile' });
  }
}

module.exports = { getMonthlyRevenue, bulkDeleteClients, createSubscription, getClientProfile };

