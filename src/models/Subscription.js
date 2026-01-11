const mongoose = require('mongoose');

/**
 * Subscription Schema
 * Stores subscription information linked to users and Stripe
 */
const SubscriptionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Stripe references
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
  
  // Plan information
  plan: {
    type: String,
    enum: ['1-month', '3-month', '6-month', '12-month'],
    required: true
  },
  
  stripePriceId: {
    type: String,
    required: true
  },
  
  // Billing information
  currentPeriodStart: {
    type: Date,
    required: true
  },
  
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  
  // Subscription status
  status: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'unpaid', 'paused'],
    default: 'active',
    index: true
  },
  
  // Cancellation information
  canceledAt: {
    type: Date,
    default: null
  },
  
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  
  // Payment method
  paymentMethodId: {
    type: String,
    default: null
  },
  
  // Pricing information
  amount: {
    type: Number, // Amount in cents (e.g., 999 = $9.99)
    required: true
  },
  
  currency: {
    type: String,
    default: 'usd',
    enum: ['usd', 'eur', 'gbp']
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Last webhook event timestamp
  lastWebhookEventAt: {
    type: Date,
    default: null
  },
  
  // Billing environment (test or production)
  billingEnvironment: {
    type: String,
    enum: ['test', 'production'],
    default: 'test'
  },

  // Checkout session tracking
  checkoutSessionId: {
    type: String,
    sparse: true
  },

  // Invoice tracking
  invoices: [{
    stripeInvoiceId: String,
    amount: Number,
    status: String, // 'draft', 'open', 'paid', 'uncollectible', 'void'
    paidAt: Date,
    dueDatetime: Date,
    url: String
  }],

  // Event log for webhook processing
  eventLog: [{
    eventType: String, // 'customer.subscription.created', 'invoice.payment_succeeded', etc.
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }]
});

// Index for efficient querying
SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ stripeCustomerId: 1, status: 1 });
SubscriptionSchema.index({ currentPeriodEnd: 1 });

// Update the updatedAt timestamp before saving
SubscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
