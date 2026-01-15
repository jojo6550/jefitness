const mongoose = require('mongoose');

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

module.exports = mongoose.model('Subscription', SubscriptionSchema);
