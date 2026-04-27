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
    active: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    paypalTransactionId: String,
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'jmd' },
    purchasedAt: Date,
  },
  { timestamps: { currentTime: () => new Date() } }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
