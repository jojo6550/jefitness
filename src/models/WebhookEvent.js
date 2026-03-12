const mongoose = require('mongoose');

/**
 * WebhookEvent Model
 * Stores processed webhook events for replay protection
 * Uses MongoDB TTL index for automatic cleanup
 */
const WebhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Stripe webhook event ID (immutable)'
  },
  eventType: {
    type: String,
    required: true,
    description: 'Type of webhook event (e.g., customer.subscription.created)'
  },
  processedAt: {
    type: Date,
    default: Date.now,
    description: 'When this event was first processed'
  },
  // TTL index will automatically delete this document after 24 hours
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: { expireAfterSeconds: 0 },
    description: 'Document auto-deletion time (TTL)'
  }
}, { timestamps: false }); // Don't add createdAt/updatedAt since we manage the lifecycle

// SECURITY: Prevent duplicate key error on race conditions
// This is a safe no-op if the event already exists
WebhookEventSchema.methods.ensureProcessed = async function() {
  try {
    return await this.constructor.findOneAndUpdate(
      { eventId: this.eventId },
      this.toObject(),
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error - event already processed, this is fine
      return await this.constructor.findOne({ eventId: this.eventId });
    }
    throw err;
  }
};

module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);
