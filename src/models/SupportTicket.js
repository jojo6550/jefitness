const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'bug-report',
        'feature-request',
        'billing-issue',
        'account-issue',
        'general-inquiry',
      ],
    },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'seen', 'resolved'],
      default: 'draft',
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    seenAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
