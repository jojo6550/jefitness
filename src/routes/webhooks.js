const express = require('express');
const Subscription = require('../models/Subscription');
const { logger, logSecurityEvent } = require('../services/logger');
const {
  isWebhookEventProcessed,
  markWebhookEventProcessed,
} = require('../services/webhookUtils');
const {
  ALLOWED_WEBHOOK_EVENTS: ALLOWED_EVENTS_ARRAY,
} = require('../config/subscriptionConstants');
const paypalService = require('../services/paypal');

const router = express.Router();

const webhookSecret = process.env.PAYPAL_WEBHOOK_ID;
const ALLOWED_WEBHOOK_EVENTS = new Set(ALLOWED_EVENTS_ARRAY);

const webhookMiddleware = express.json();

async function handlePaypalWebhook(req, res) {
  const webhook_id = webhookSecret;
  let event;

  if (!webhookSecret) {
    logger.error('PayPal webhook secret not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    const client = paypalService.getPaypalClient();
    if (!client) {
      logger.error('PayPal not initialized');
      return res.status(500).send('PayPal not configured');
    }

    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const WebhookEvent = checkoutNodeJssdk.orders;

    event = req.body;
  } catch (err) {
    logSecurityEvent('WEBHOOK_SIGNATURE_INVALID', null, { error: err.message }, req).catch(() => {});
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (!event || !event.id || !event.event_type) {
    logSecurityEvent('WEBHOOK_INVALID_STRUCTURE', null, { eventId: event?.id }, req).catch(() => {});
    return res.status(400).send('Invalid event structure');
  }

  logger.info('PayPal webhook received', { eventType: event.event_type, eventId: event.id });

  if (!ALLOWED_WEBHOOK_EVENTS.has(event.event_type)) {
    logger.warn('Unhandled webhook event type', {
      eventType: event.event_type,
      eventId: event.id,
    });
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
      case 'PAYMENT.SALE.COMPLETED':
        await handleSaleCompleted(event.resource);
        break;
      case 'PAYMENT.SALE.REFUNDED':
        await handleSaleRefunded(event.resource);
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

async function handleSaleCompleted(sale) {
  logger.info('PayPal sale completed', { saleId: sale.id });

  if (!sale.custom) {
    logger.warn('Sale has no userId', { saleId: sale.id });
    return;
  }

  let subscription = await Subscription.findOne({ userId: sale.custom });

  if (!subscription) {
    logger.warn('Subscription not found for completed sale', { userId: sale.custom });
    return;
  }

  subscription.active = true;
  await subscription.save();

  logger.info('Subscription activated via webhook', {
    subscriptionId: subscription._id,
    saleId: sale.id,
  });
}

async function handleSaleRefunded(sale) {
  logger.info('PayPal sale refunded', { saleId: sale.id });

  if (!sale.custom) {
    logger.warn('Refunded sale has no userId', { saleId: sale.id });
    return;
  }

  let subscription = await Subscription.findOne({ userId: sale.custom });

  if (!subscription) {
    logger.warn('Subscription not found for refunded sale', { userId: sale.custom });
    return;
  }

  subscription.active = false;
  await subscription.save();

  logger.info('Subscription deactivated via refund webhook', {
    subscriptionId: subscription._id,
    saleId: sale.id,
  });
}

module.exports = router;
