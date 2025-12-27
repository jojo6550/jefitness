const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
    program: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price must be positive']
    }
});

const OrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    items: [OrderItemSchema],
    subtotal: {
        type: Number,
        required: true
    },
    tax: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        required: true
    },
    billingInfo: {
        fullName: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String },
        address: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: {
            type: String,
            match: [/^\d{5}(-\d{4})?$/, 'Please enter a valid zip code (e.g., 12345 or 12345-6789)']
        },
        country: { type: String }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save hook to enforce referential integrity
OrderSchema.pre('save', async function(next) {
  const User = mongoose.model('User');
  const userExists = await User.findById(this.user);
  if (!userExists) {
    return next(new Error('Referenced user does not exist'));
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);
