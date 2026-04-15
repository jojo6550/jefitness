const Subscription = require('../models/Subscription');
const { logger } = require('./logger');
const stripeService = require('./stripe');
const User = require('../models/User');

const STATES = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  CANCELLED: 'cancelled'
};

/**
 * Get or create subscription document for user (exactly ONE per user)
 * Creates trialing state if none exists
 */
async function getOrCreateSubscription(userId) {
  let subscription = await Subscription.findOne({ userId });
  
  if (!subscription) {
    // Auto-create trialing (default state)
    subscription = new Subscription({
      userId,
      state: STATES.TRIALING,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30d trial
      updatedAt: new Date()
    });
    await subscription.save();
    logger.info('Created trialing subscription', { userId: userId.toString() });
  }
  
  return subscription;
}

/**
 * Pure function: Check if user has access based on state + currentPeriodEnd
 * Access if: state === "active" OR (state === "cancelled" AND now < currentPeriodEnd)
 * Deterministic, UTC-safe
 */
function hasActiveAccess(subscription) {
  const now = new Date();
  const hasAccess = subscription.state === STATES.ACTIVE || 
                   (subscription.state === STATES.CANCELLED && now < subscription.currentPeriodEnd);
  return hasAccess;
}

/**
 * Check if expired and auto-transition to trialing if current time > currentPeriodEnd
 * Called on every access check. No Stripe verification (deterministic)
 */
async function checkAndHandleExpiration(subscription) {
  const now = new Date();
  
  if (subscription.state !== STATES.TRIALING && now > subscription.currentPeriodEnd) {
    subscription.state = STATES.TRIALING;
    subscription.updatedAt = now;
    await subscription.save();
    logger.info('Auto-expired subscription to trialing', { 
      userId: subscription.userId.toString(),
      oldState: subscription.state 
    });
    return true; // Expired
  }
  
  return false; // Not expired
}

/**
 * Create or update subscription from Stripe webhook data
 * Idempotent upsert by userId. Minimal fields only. Maps Stripe status to app states.
 */
async function createOrUpdateFromStripe(stripeData, userId) {
  const now = new Date();
  
  // Map Stripe status → app state
  let state;
  const stripeStatus = stripeData.status;
  if (['active', 'trialing'].includes(stripeStatus)) {
    state = STATES.ACTIVE;
  } else if (['cancelled', 'incomplete_expired', 'past_due'].includes(stripeStatus)) {
    state = STATES.CANCELLED;
  } else {
    state = STATES.TRIALING;
  }
  
  // Upsert (exactly one doc per userId)
  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        state,
        stripeCustomerId: stripeData.customer,
        stripeSubscriptionId: stripeData.id,
        currentPeriodEnd: new Date(stripeData.current_period_end * 1000),
        updatedAt: now
      }
    },
    { upsert: true, new: true, runValidators: true }
  );
  
  logger.info('Synced subscription from Stripe', { 
    userId: userId.toString(),
    state,
    stripeSubId: stripeData.id 
  });
  
  return subscription;
}

/**
 * Cancel subscription: set state = "cancelled" (access until periodEnd)
 * Optionally cancel Stripe sub.
 */
async function cancelSubscription(userId, cancelStripe = true) {
  const subscription = await getOrCreateSubscription(userId);
  subscription.state = STATES.CANCELLED;
  subscription.updatedAt = new Date();
  await subscription.save();
  
  // Cancel Stripe if requested and exists
  if (cancelStripe && subscription.stripeSubscriptionId) {
    try {
      await stripeService.cancelSubscription(subscription.stripeSubscriptionId, true); // at period end
      logger.info('Cancelled Stripe subscription', { stripeSubId: subscription.stripeSubscriptionId });
    } catch (err) {
      logger.warn('Stripe cancel failed (non-fatal)', { error: err.message });
    }
  }
  
  logger.info('Subscription cancelled', { userId: userId.toString() });
  return subscription;
}

/**
 * Admin: Set explicit state + periodEnd (override)
 * Used for manual creation/extension
 */
async function setSubscriptionState(userId, state, periodEnd, stripeCustomerId = '', stripeSubscriptionId = '') {
  if (!Object.values(STATES).includes(state)) {
    throw new Error(`Invalid state: ${state}`);
  }
  
  const now = new Date();
  const subscription = await getOrCreateSubscription(userId);
  
  subscription.state = state;
  subscription.currentPeriodEnd = new Date(periodEnd);
  subscription.stripeCustomerId = stripeCustomerId;
  subscription.stripeSubscriptionId = stripeSubscriptionId;
  subscription.updatedAt = now;
  
  await subscription.save();
  
  logger.info('Admin set subscription state', { 
    userId: userId.toString(),
    state,
    periodEnd: subscription.currentPeriodEnd.toISOString()
  });
  
  return subscription;
}

module.exports = {
  getOrCreateSubscription,
  hasActiveAccess,
  checkAndHandleExpiration,
  createOrUpdateFromStripe,
  cancelSubscription,
  setSubscriptionState,
  STATES
};

