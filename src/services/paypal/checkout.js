const { getPaypalClient } = require('./client');
const { logger } = require('../logger');

const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
const { OrdersCreateRequest, OrdersCaptureRequest, OrdersGetRequest } = checkoutNodeJssdk.orders;

const PAYPAL_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ]);
}

async function createPaymentLink(planKey, planData, userId) {
  try {
    const client = getPaypalClient();
    if (!client) {
      throw new Error('PayPal not initialized');
    }

    const request = new OrdersCreateRequest();
    request.prefer('return=representation');
    request.body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: planData.currency,
            value: String(planData.price),
          },
          description: `${planKey} Subscription - ${planData.durationDays} days`,
          custom_id: userId,
        },
      ],
      application_context: {
        brand_name: 'JeFitness',
        user_action: 'PAY_NOW',
        landing_page: 'NO_PREFERENCE',
      },
    };

    const response = await client.execute(request);

    logger.debug('PayPal order created', {
      orderId: response.result.id,
      planKey,
      userId,
    });

    const approval_link = response.result.links.find((link) => link.rel === 'approve');

    return {
      orderId: response.result.id,
      approvalLink: approval_link?.href,
      status: response.result.status,
    };
  } catch (error) {
    logger.error('PayPal checkout creation failed', {
      planKey,
      userId,
      error: error.message,
    });
    throw error;
  }
}

async function capturePayment(orderId) {
  try {
    const client = getPaypalClient();
    if (!client) {
      throw new Error('PayPal not initialized');
    }

    const request = new OrdersCaptureRequest(orderId);
    request.requestBody({});

    const response = await withTimeout(client.execute(request), PAYPAL_TIMEOUT_MS, 'capturePayment');

    logger.debug('PayPal order captured', {
      orderId,
      status: response.result.status,
    });

    return response.result;
  } catch (error) {
    logger.error('PayPal capture failed', {
      orderId,
      error: error.message,
    });
    throw error;
  }
}

async function getOrderDetails(orderId) {
  try {
    const client = getPaypalClient();
    if (!client) {
      throw new Error('PayPal not initialized');
    }

    const request = new OrdersGetRequest(orderId);
    const response = await withTimeout(client.execute(request), PAYPAL_TIMEOUT_MS, 'getOrderDetails');

    return response.result;
  } catch (error) {
    logger.error('PayPal order details fetch failed', {
      orderId,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createPaymentLink,
  capturePayment,
  getOrderDetails,
};
