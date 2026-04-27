let paypalClient = null;

const getPaypalClient = () => {
  if (!paypalClient && process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET) {
    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

    const environment =
      process.env.NODE_ENV === 'production'
        ? new checkoutNodeJssdk.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET)
        : new checkoutNodeJssdk.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);

    paypalClient = new checkoutNodeJssdk.PayPalHttpClient(environment);
  }

  return paypalClient;
};

module.exports = {
  getPaypalClient,
};
