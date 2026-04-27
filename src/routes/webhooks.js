const express = require('express');
const Subscription = require('../models/Subscription');
const { logger, logSecurityEvent } = require('../services/logger');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../services/webhookUtils');
const {
  ALLOWED_WEBHOOK_EVENTS: ALLOWED_EVENTS_ARRAY,
  PLANS,
} = require('../config/subscriptionConstants');
const paypalService = require('../services/paypal');

const router = express.Router();

const webhookSecret = process.env.PAYPAL_WEBHOOK_ID;
const ALLOWED_WEBHOOK_EVENTS = new Set(ALLOWED_EVENTS_ARRAY);

// Raw body needed for signature verification
const webhookMiddleware = express.json();

async function handlePaypalWebhook(req, res) {
  if (!webhookSecret) {
    logger.error('PayPal webhook secret not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  // Verify PayPal signature
  try {
    const valid = await paypalService.verifyWebhookSignature(req.headers, req.body, webhookSecret);
    if (!valid) {
      logSecurityEvent('WEBHOOK_SIGNATURE_INVALID', null, { headers: req.headers }, req).catch(() => {});
      return res.status(400).send('Invalid webhook signature');
    }
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return res.status(400).send(`Webhook verification error: ${err.message}`);
  }

  const event = req.body;

  if (!event || !event.id || !event.event_type) {
    logSecurityEvent('WEBHOOK_INVALID_STRUCTURE', null, { eventId: event?.id }, req).catch(() => {});
    return res.status(400).send('Invalid event structure');
  }

  logger.info('PayPal webhook received', { eventType: event.event_type, eventId: event.id });

  if (!ALLOWED_WEBHOOK_EVENTS.has(event.event_type)) {
    return res.status(200).json({ received: true, processed: false });
  }

  const alreadyProcessed = await isWebhookEventProcessed(event.id);
  if (alreadyProcessed) {
    logger.warn('Webhook replay attempt', { eventId: event.id });
    return res.status(200).json({ received: true, processed: false });
  }

  try {
    await markWebhookEventProcessed(event.id, event.event_type);

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handleCaptureCompleted(event.resource);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.DENIED':
        await handleCaptureInvalidated(event.resource);
        break;
    }

    res.status(200).json({ received: true, processed: true });
  } catch (error) {
    logger.error('Error processing PayPal webhook', {
      eventType: event.event_type,
      eventId: event.id,
      error: error.message,
    });
    res.status(200).json({ received: true, processed: false });
  }
}

router.post('/paypal', webhookMiddleware, handlePaypalWebhook);
router.post('/', webhookMiddleware, handlePaypalWebhook);

// ===== HELPERS =====

// custom_id format: "userId:planKey" (set during checkout creation)
function parseCustomId(customId) {
  if (!customId) return { userId: null, planKey: null };
  const idx = customId.indexOf(':');
  if (idx === -1) return { userId: customId, planKey: null };
  return { userId: customId.slice(0, idx), planKey: customId.slice(idx + 1) };
}

async function handleCaptureCompleted(capture) {
  logger.info('PayPal capture completed', { captureId: capture.id });

  const { userId, planKey } = parseCustomId(capture.custom_id);

  if (!userId) {
    logger.warn('Capture has no userId in custom_id', { captureId: capture.id });
    return;
  }

  const planData = PLANS[planKey] || PLANS['1-month'];
  const now = new Date();

  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        active: true,
        expiresAt: new Date(now.getTime() + planData.durationDays * 24 * 60 * 60 * 1000),
        paypalTransactionId: capture.id,
        amount: parseFloat(capture.amount?.value || 0),
        currency: capture.amount?.currency_code || 'USD',
        purchasedAt: now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('Subscription activated via webhook', {
    subscriptionId: subscription._id,
    captureId: capture.id,
    userId,
    planKey,
  });
}

async function handleCaptureInvalidated(capture) {
  logger.info('PayPal capture invalidated', { captureId: capture.id });

  const { userId } = parseCustomId(capture.custom_id);

  if (!userId) {
    logger.warn('Capture has no userId in custom_id', { captureId: capture.id });
    return;
  }

  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    { $set: { active: false } },
    { new: true }
  );

  if (!subscription) {
    logger.warn('Subscription not found for invalidated capture', { userId });
    return;
  }

  logger.info('Subscription deactivated via webhook', {
    subscriptionId: subscription._id,
    captureId: capture.id,
    userId,
  });
}

module.exports = router;
