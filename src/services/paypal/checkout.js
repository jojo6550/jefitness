const { getPaypalClient } = require('./client');
const { getPrimaryAppUrl } = require('../../config/security');
const { logger } = require('../logger');

async function createPaymentLink(planKey, planData, userId) {
  try {
    const client = getPaypalClient();
    if (!client) {
      throw new Error('PayPal not initialized');
    }

    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const OrdersCreateRequest = checkoutNodeJssdk.orders.OrdersCreateRequest;

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
        return_url: `${getPrimaryAppUrl()}/subscriptions?success=true`,
        cancel_url: `${getPrimaryAppUrl()}/subscriptions?cancelled=true`,
        user_action: 'PAY_NOW',
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

    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const OrdersCaptureRequest = checkoutNodeJssdk.orders.OrdersCaptureRequest;

    const request = new OrdersCaptureRequest(orderId);
    request.requestBody({});

    const response = await client.execute(request);

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

    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const OrdersGetRequest = checkoutNodeJssdk.orders.OrdersGetRequest;

    const request = new OrdersGetRequest(orderId);
    const response = await client.execute(request);

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
