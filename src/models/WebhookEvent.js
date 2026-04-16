const mongoose = require('mongoose');

/**
 * WebhookEvent Model
 * Stores processed webhook events for replay protection
 * Uses MongoDB TTL index for automatic cleanup
 */
const WebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true, // unique already creates an index
      description: 'Stripe webhook event ID (immutable)',
    },
    eventType: {
      type: String,
      required: true,
      description: 'Type of webhook event (e.g., customer.subscription.created)',
    },
    processedAt: {
      type: Date,
      default: Date.now,
      description: 'When this event was first processed',
    },
    // TTL index: MongoDB auto-deletes doc after 24 hours
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
      description: 'Document auto-deletion time (TTL)',
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);
