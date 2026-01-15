const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stripeCustomerId: String,
  stripeCheckoutSessionId: String,
  stripePaymentIntentId: String,
  items: [{
    productKey: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number
  }],
  totalAmount: Number,
  currency: { type: String, default: 'jmd' },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  billingEnvironment: { type: String, enum: ['test', 'production'] }
}, { timestamps: true });

module.exports = mongoose.model('Purchase', PurchaseSchema);
