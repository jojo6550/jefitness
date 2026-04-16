const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    plan: {
      type: String,
      enum: ['1-month', '3-month', '6-month', '12-month'],
    },
    stripePriceId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    status: {
      type: String,
      enum: ['active', 'cancelled', 'trialing'],
      default: 'trialing',
      index: true,
    },
    canceledAt: Date,
    checkoutSessionId: String,
    queuedPlan: {
      plan: String,
      stripeSubscriptionId: String,
      stripePriceId: String,
      currentPeriodEnd: Date,
    },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'jmd' },
    billingEnvironment: {
      type: String,
      enum: ['test', 'production'],
    },
  },
  { timestamps: { currentTime: () => new Date() } }
);

subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
