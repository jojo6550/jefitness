const WebhookEvent = require('../models/WebhookEvent');
const { logger } = require('./logger');

/**
 * SECURITY: Helper to check if webhook event has been processed (replay protection)
 * Uses MongoDB for persistence across server restarts and instances
 * @param {string} eventId - Stripe webhook event ID
 * @returns {Promise<boolean>} True if event was already processed
 */
async function isWebhookEventProcessed(eventId) {
  try {
    const exists = await WebhookEvent.exists({ eventId });
    return !!exists;
  } catch (err) {
    // If database is down, log error and fall back to safe behavior
    // (reject the event to prevent potential duplicate processing)
    logger.error('Failed to check webhook event status', { error: err.message });
    return true; // Assume processed on error (safe failure)
  }
}

/**
 * SECURITY: Mark webhook event as processed
 * Uses MongoDB TTL index for automatic cleanup after 24 hours
 * This prevents memory leaks and works across multiple server instances
 * @param {string} eventId - Stripe webhook event ID
 * @param {string} eventType - Type of webhook event
 * @returns {Promise<void>}
 */
async function markWebhookEventProcessed(eventId, eventType = 'unknown') {
  try {
    // $setOnInsert is a no-op if doc already exists — atomic, race-condition safe
    await WebhookEvent.findOneAndUpdate(
      { eventId },
      {
        $setOnInsert: {
          eventId,
          eventType,
          processedAt: new Date(),
          // expiresAt defaults to 24h from now via schema default
        },
      },
      { upsert: true }
    );
    logger.info('Webhook event marked as processed', { eventId });
  } catch (err) {
    // Log error but don't throw - webhook processing should continue
    logger.error('Failed to mark webhook event as processed', {
      eventId,
      error: err.message,
    });
  }
}

module.exports = { isWebhookEventProcessed, markWebhookEventProcessed };
