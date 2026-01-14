const mongoose = require('mongoose');

/**
 * Subscription Schema
 * Stores subscription information linked to users and Stripe
 */
const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stripeCustomerId: { type: String, required: true, index: true },
  stripeSubscriptionId: { type: String, required: true, unique: true, index: true },
  plan: { type: String, enum: ['1-month', '3-month', '6-month', '12-month'], required: true },
  stripePriceId: { type: String, required: true },
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'past_due', 'canceled', 'unpaid', 'paused'], default: 'active', index: true },
  canceledAt: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  paymentMethodId: { type: String, default: null },
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['usd', 'eur', 'gbp'], default: 'usd' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastWebhookEventAt: { type: Date, default: null },
  eventLog: [{
    eventType: String,
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  invoices: [{
    stripeInvoiceId: String,
    amount: Number,
    status: { type: String, enum: ['draft', 'open', 'paid', 'uncollectible', 'void'] },
    paidAt: Date,
    dueDatetime: Date,
    url: String
  }],
  checkoutSessionId: { type: String, sparse: true },
  billingEnvironment: { type: String, enum: ['test', 'production'], default: 'test' }
}, { timestamps: true });

// Compound index for faster active subscription query
SubscriptionSchema.index({ userId: 1, status: 1, currentPeriodEnd: -1 });

// Auto-update updatedAt on save
SubscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
