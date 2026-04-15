const mongoose = require('mongoose');

/**
 * ONE subscription document PER USER
 * States: active, cancelled, trialing (no subscription)
 * Stripe-backed for paid plans; admin override via overrideEndDate
 */
const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // ENFORCED: Exactly one per user
      index: true,
    },

    stripeCustomerId: {
      type: String,
      required: true,
      index: true,
    },

    stripeSubscriptionId: {
      type: String,
      sparse: true, // Optional if admin-created
      index: true,
    },

    plan: {
      type: String,
      enum: ['1-month', '3-month', '6-month', '12-month'],
      required: true,
    },

    stripePriceId: {
      type: String,
      sparse: true,
    },

    currentPeriodStart: {
      type: Date,
      required: true,
    },

    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },

    overrideEndDate: {
      type: Date,
      default: null, // Admin override: supersedes currentPeriodEnd for expiration checks
    },

    status: {
      type: String,
      enum: ['active', 'cancelled', 'trialing'],
      required: true,
      index: true,
    },

    canceledAt: {
      type: Date,
      default: null,
    },

    checkoutSessionId: {
      type: String,
      default: null,
    },

    lastWebhookEventAt: {
      type: Date,
      default: null,
    },

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },

    amount: {
      type: Number,
      required: true, // cents
    },

    currency: {
      type: String,
      default: 'jmd',
    },

    billingEnvironment: {
      type: String,
      enum: ['test', 'production'],
      required: true,
    },

    statusHistory: [
      {
        status: String,
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: String,
      },
    ],
  },
  {
    timestamps: {
      createdAt: 'utcCreatedAt',
      updatedAt: 'utcUpdatedAt',
    },
  }
);

// Fast lookup by user + status
SubscriptionSchema.index({ userId: 1, status: 1 });

// Track status changes
SubscriptionSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      reason: 'Status updated',
    });
  }
  next();
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);

