const mongoose = require('mongoose');

const StripePlanSchema = new mongoose.Schema(
  {
    stripePriceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripeProductId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    lookupKey: {
      type: String,
      index: true,
    },
    unitAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    interval: {
      type: String,
      required: true,
    },
    intervalCount: {
      type: Number,
      default: 1,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    nickname: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    productImages: [
      {
        type: String,
      },
    ],
    lastSyncedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Composite indexes
StripePlanSchema.index({ active: 1, unitAmount: 1 });

module.exports = mongoose.model('StripePlan', StripePlanSchema);
