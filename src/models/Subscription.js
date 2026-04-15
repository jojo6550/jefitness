const mongoose = require('mongoose');

/**
 * ONE subscription document PER USER - MINIMAL STATE-DRIVEN DESIGN
 * Fields: userId, state, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, updatedAt
 * States: "trialing" (default), "active", "cancelled"
 * Access: state === "active" OR (state === "cancelled" AND now < currentPeriodEnd)
 */

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // Exactly ONE per user
      index: true,
    },

    state: {
      type: String,
      enum: ['trialing', 'active', 'cancelled'],
      required: true,
      index: true,
      default: 'trialing'
    },

    stripeCustomerId: {
      type: String,
      sparse: true,
      index: true,
    },

    stripeSubscriptionId: {
      type: String,
      sparse: true,
      index: true,
    },

    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    }
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt'
    }
  }
);

// Compound index for fast lookups
SubscriptionSchema.index({ userId: 1, state: 1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);

