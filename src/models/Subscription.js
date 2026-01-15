const mongoose = require('mongoose');
const { cancelSubscription } = require('../services/stripe');

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
      enum: ['active', 'past_due', 'canceled', 'unpaid', 'paused'],
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
    }
  },
  { timestamps: true }
);

// 🔎 Fast active lookup
SubscriptionSchema.index({ userId: 1, status: 1, currentPeriodEnd: -1 });

// Pre-save hook to ensure Stripe cancellation when status changes to 'canceled'
SubscriptionSchema.pre('save', async function(next) {
  try {
    // Check if status is being changed to 'canceled'
    if (this.isModified('status') && this.status === 'canceled' && this.stripeSubscriptionId) {
      // Only cancel on Stripe if not already canceled
      // We can't easily check Stripe status here without an API call,
      // but the cancelSubscription function handles "already canceled" errors gracefully
      console.log(`🔄 Canceling subscription ${this.stripeSubscriptionId} on Stripe due to DB status change`);

      try {
        // Cancel immediately (atPeriodEnd = false) when DB is set to canceled
        await cancelSubscription(this.stripeSubscriptionId, false);
        console.log(`✅ Successfully canceled subscription ${this.stripeSubscriptionId} on Stripe`);
      } catch (stripeError) {
        // If already canceled, that's fine - just log it
        if (stripeError.message.includes('already canceled') || stripeError.message.includes('does not exist')) {
          console.log(`ℹ️ Subscription ${this.stripeSubscriptionId} was already canceled on Stripe`);
        } else {
          // For other errors, log but don't fail the save
          console.error(`❌ Failed to cancel subscription ${this.stripeSubscriptionId} on Stripe:`, stripeError.message);
        }
      }
    }
    next();
  } catch (error) {
    console.error('Error in subscription pre-save hook:', error);
    next(error);
  }
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
