const mongoose = require('mongoose');
const { cancelSubscription } = require('../services/stripe');
const { logger } = require('../services/logger');

/**
 * Stripe-backed subscription ONLY
 * Free tier does NOT exist here
 */
const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    stripeCustomerId: {
      type: String,
      required: true,
      index: true
    },

    stripeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    plan: {
      type: String,
      enum: ['1-month', '3-month', '6-month', '12-month'],
      required: true
    },

    stripePriceId: {
      type: String,
      required: true
    },

    currentPeriodStart: {
      type: Date,
      required: true
    },

    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true
    },

    status: {
      type: String,
      // All possible Stripe subscription statuses
      enum: ['active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid', 'paused'],
      required: true,
      index: true
    },

    canceledAt: {
      type: Date,
      default: null
    },

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },

    amount: {
      type: Number,
      required: true // cents
    },

    currency: {
      type: String,
      default: 'jmd'
    },

    billingEnvironment: {
      type: String,
      enum: ['test', 'production'],
      required: true
    },

    statusHistory: [{ 
      status: String,
      changedAt: { 
        type: Date, 
default: Date.now
      },
      reason: String
    }],

  },
{ timestamps: { 
  createdAt: 'utcCreatedAt', 
  updatedAt: 'utcUpdatedAt' 
}}
);

// 🔎 Fast active lookup
SubscriptionSchema.index({ userId: 1, status: 1, currentPeriodEnd: -1 });

// Track status changes
SubscriptionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      reason: 'Status updated'
    });
  }
  next();
});

// Pre-save hook to ensure Stripe cancellation when status changes to 'canceled'
SubscriptionSchema.pre('save', async function(next) {
  // Convert ALL date fields to UTC before save
  const utcConvert = (date) => date instanceof Date ? new Date(date.toUTCString()) : date;
  
  this.currentPeriodStart = utcConvert(this.currentPeriodStart);
  this.currentPeriodEnd = utcConvert(this.currentPeriodEnd);
  this.canceledAt = utcConvert(this.canceledAt);
  
  if (this.statusHistory) {
    this.statusHistory = this.statusHistory.map(h => ({
      ...h,
      changedAt: utcConvert(h.changedAt)
    }));
  }

  try {
    // Check if status is being changed to 'canceled' AND stripeSubscriptionId exists
    if (this.isModified('status') && this.status === 'canceled' && this.stripeSubscriptionId) {
      logger.info(`Canceling subscription ${this.stripeSubscriptionId} on Stripe due to DB status change`);

      try {
        // Cancel immediately (atPeriodEnd = false) when DB is set to canceled
        await cancelSubscription(this.stripeSubscriptionId, false);
        logger.info(`Successfully canceled subscription ${this.stripeSubscriptionId} on Stripe`);
      } catch (stripeError) {
        // If already canceled or missing, that's fine - just log it
        const msg = stripeError.message || '';
        if (
          msg.includes('already canceled') || 
          msg.includes('does not exist') ||
          stripeError.code === 'resource_missing' ||
          stripeError.code === 'subscription_already_canceled'
        ) {
          logger.info(`Subscription ${this.stripeSubscriptionId} already handled on Stripe - continuing`);
        } else {
          logger.error(`Non-fatal Stripe cancel error for ${this.stripeSubscriptionId}`, { error: stripeError.message });
        }
      }
    } else if (this.isModified('status') && this.status === 'canceled') {
      logger.info(`Skipping Stripe cancel - no stripeSubscriptionId for ${this._id}`);
    }
    next();
  } catch (error) {
    logger.error('Error in subscription pre-save hook', { error: error.message });
    next(error);
  }
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
