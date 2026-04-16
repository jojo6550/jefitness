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
 * Returns total amount of active subscriptions this calendar month.
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
    const users = await User.find({ _id: { $in: userIds }, role: { $ne: 'admin' } }).lean();
    const safeIds = users.map((u) => u._id.toString());

    await Subscription.deleteMany({ userId: { $in: safeIds } });
    await User.deleteMany({ _id: { $in: safeIds } });

    logger.logAdminAction('bulk_delete_clients', adminId, {
      deletedCount: safeIds.length,
      userIds: safeIds,
    });

    res.json({ msg: `Deleted ${safeIds.length} client(s)`, deletedCount: safeIds.length });
  } catch (err) {
    logger.error('Bulk delete failed', { error: err.message });
    res.status(500).json({ msg: 'Bulk delete failed' });
  }
}

/**
 * POST /api/v1/admin/subscriptions
 * Creates a real Stripe subscription for a client, with optional day override.
 * Body: { userId, planKey, overrideDays? }
 *   planKey: '1-month' | '3-month' | '6-month' | '12-month'
 *   overrideDays: number (optional) — if set, uses trial_end to set a custom period end
 */
async function createSubscription(req, res) {
  let stripeSub = null;
  try {
    const { userId, planKey, overrideDays } = req.body;
    const adminId = req.user.id;

    // Validate planKey
    const validPlans = ['1-month', '3-month', '6-month', '12-month'];
    if (!planKey || !validPlans.includes(planKey)) {
      return res.status(400).json({ msg: 'Invalid planKey. Must be one of: ' + validPlans.join(', ') });
    }

    // Validate overrideDays
    const planDurations = { '1-month': 30, '3-month': 90, '6-month': 180, '12-month': 365 };
    const maxDays = planDurations[planKey] * 2;
    if (overrideDays !== undefined) {
      const days = parseInt(overrideDays, 10);
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ msg: 'overrideDays must be a positive integer' });
      }
      if (days > maxDays) {
        return res.status(400).json({ msg: `overrideDays cannot exceed ${maxDays} for the ${planKey} plan` });
      }
    }

    // Validate userId
    if (!userId) return res.status(400).json({ msg: 'userId is required' });

    // Find user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ msg: 'Cannot add subscription to admin account' });

    // Admin day override: DB-only, no Stripe changes
    if (overrideDays !== undefined) {
      const days = parseInt(overrideDays, 10);
      const now = new Date();
      const newPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const existingSub = await user.getActiveSubscription();
      if (!existingSub) {
        return res.status(400).json({ msg: 'User has no active subscription to extend. Create a subscription first.' });
      }

      const updatedSub = await Subscription.findByIdAndUpdate(
        existingSub._id,
        {
          $set: { currentPeriodEnd: newPeriodEnd, status: 'active' },
          $push: { statusHistory: { status: 'active', changedAt: now, reason: `Admin extended by ${days} days` } },
        },
        { new: true }
      );

      logger.logAdminAction('subscription_extended', adminId, {
        userId,
        plan: existingSub.plan,
        overrideDays: days,
        subscriptionId: existingSub._id.toString(),
        newPeriodEnd: newPeriodEnd.toISOString(),
      });

      return res.json({
        msg: 'Subscription extended successfully',
        subscription: {
          plan: updatedSub.plan,
          status: 'active',
          currentPeriodEnd: newPeriodEnd,
          daysLeft: daysLeftUntil(newPeriodEnd),
          stripeSubscriptionId: existingSub.stripeSubscriptionId,
        },
      });
    }

    // Find StripePlan by interval matching plan
    const intervalMap = {
      '1-month': { interval: 'month', intervalCount: 1 },
      '3-month': { interval: 'month', intervalCount: 3 },
      '6-month': { interval: 'month', intervalCount: 6 },
      '12-month': { interval: 'year', intervalCount: 1 },
    };
    const { interval, intervalCount } = intervalMap[planKey];

    const plan = await StripePlan.findOne({
      active: true,
      interval,
      intervalCount,
    }).lean();

    if (!plan) {
      return res.status(400).json({ msg: `No active Stripe plan found for ${planKey}` });
    }

// Ensure Stripe customer exists (DEFENSIVE: verify even if DB has ID)
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      // Create fresh customer
      const customer = await getStripeClient().customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user._id.toString() },
      });
      stripeCustomerId = customer.id;
      logger.info('Admin: created new Stripe customer', { customerId: stripeCustomerId, userId: user._id.toString() });
    } else {
      // Verify existing customer ID is valid
      try {
        await getStripeClient().customers.retrieve(stripeCustomerId);
        logger.debug('Admin: verified existing Stripe customer', { customerId: stripeCustomerId });
      } catch (custErr) {
        if (custErr.code === 'resource_missing') {
          logger.warn('Admin: stale customer ID found, creating fresh customer', { 
            oldCustomerId: stripeCustomerId, 
            userId: user._id.toString() 
          });
          // Clear stale DB record and create new
          user.stripeCustomerId = null;
          await user.save();
          
          const customer = await getStripeClient().customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            metadata: { userId: user._id.toString() },
          });
          stripeCustomerId = customer.id;
        } else {
          throw custErr; // Other Stripe errors bubble up
        }
      }
    }

    if (user.stripeCustomerId !== stripeCustomerId) {
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Calculate trial_end for Stripe (Unix seconds). Use calendar arithmetic to avoid DST drift.
    const now = new Date();
    let trialEndDate;
    if (overrideDays !== undefined) {
      // overrideDays is an admin override — use exact day count via addMonths approximation isn't needed;
      // for arbitrary day counts we add days at the millisecond level which is fine (admin-only path).
      trialEndDate = new Date(now.getTime() + parseInt(overrideDays, 10) * 24 * 60 * 60 * 1000);
    } else {
      // Standard plan: use calendar-safe arithmetic from dateUtils
      const planIntervalMap = {
        '1-month': () => addMonths(now, 1),
        '3-month': () => addMonths(now, 3),
        '6-month': () => addMonths(now, 6),
        '12-month': () => addYears(now, 1),
      };
      trialEndDate = planIntervalMap[planKey]();
    }
    const trialEnd = Math.floor(trialEndDate.getTime() / 1000);

    // Cancel any existing active subscription first
    const existingSub = await user.getActiveSubscription();
    if (existingSub && existingSub.stripeSubscriptionId) {
      try {
        await getStripeClient().subscriptions.cancel(existingSub.stripeSubscriptionId);
        existingSub.status = 'canceled';
        existingSub.canceledAt = new Date();
        await existingSub.save();
      } catch (cancelErr) {
        logger.error('Failed to cancel existing subscription before admin create', { error: cancelErr.message });
      }
    }

    // Create Stripe subscription with trial_end to set custom period
    stripeSub = await getStripeClient().subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      trial_end: trialEnd,
      metadata: { adminCreated: 'true', adminId: adminId.toString(), userId: userId.toString() },
    });

    const periodEnd = new Date(stripeSub.trial_end * 1000);

    // Upsert Subscription document
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: stripeSub.id },
      {
        $set: {
          userId: user._id,
          stripeCustomerId,
          stripeSubscriptionId: stripeSub.id,
          plan: planKey,
          stripePriceId: plan.stripePriceId,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          status: 'trialing',
          amount: plan.unitAmount,
          currency: plan.currency || 'jmd',
          billingEnvironment: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test',
        },
        $push: {
          statusHistory: { status: 'trialing', changedAt: new Date(), reason: 'Admin created' },
        },
      },
      { upsert: true, new: true }
    );

    // Update user's subscription reference (use findByIdAndUpdate to bypass Mongoose strict mode)
    await User.findByIdAndUpdate(user._id, {
      $set: { stripeSubscriptionId: stripeSub.id },
    });

    logger.logAdminAction('subscription_created', adminId, {
      userId,
      planKey,
      overrideDays: overrideDays !== undefined ? parseInt(overrideDays, 10) : null,
      stripeSubscriptionId: stripeSub.id,
      periodEnd: periodEnd.toISOString(),
    });

    res.json({
      msg: 'Subscription created successfully',
      subscription: {
        plan: planKey,
        status: 'trialing',
        currentPeriodEnd: periodEnd,
        daysLeft: daysLeftUntil(periodEnd),
        stripeSubscriptionId: stripeSub.id,
      },
    });
  } catch (err) {
    logger.error('Admin subscription creation failed', {
      error: err.message,
      stack: err.stack,
      stripeSubscriptionId: stripeSub ? stripeSub.id : undefined,
    });
    res.status(500).json({ msg: 'Failed to create subscription' });
  }
}

/**
 * GET /api/v1/admin/clients/:id
 * Returns full client profile: user doc + active subscription.
 */
async function getClientProfile(req, res) {
  try {
    const { id } = req.params;

    const [user, subscription] = await Promise.all([
      User.findById(id).select('-password -tokenVersion -emailVerificationToken -emailVerificationExpires -passwordResetToken -resetPasswordExpires -twoFactorSecret -twoFactorBackupCodes').lean(),
      Subscription.findOne({ userId: id, status: { $in: ['active', 'trialing'] } }).lean(),
    ]);

    if (!user) return res.status(404).json({ msg: 'Client not found' });
    if (user.role === 'admin') return res.status(403).json({ msg: 'Cannot view admin accounts' });

    res.json({ client: { ...user, subscription: subscription || null } });
  } catch (err) {
    logger.error('Failed to fetch client profile', { error: err.message });
    res.status(500).json({ msg: 'Failed to fetch client profile' });
  }
}

module.exports = { getMonthlyRevenue, bulkDeleteClients, createSubscription, getClientProfile };
