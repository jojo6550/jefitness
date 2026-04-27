let paypalClient = null;

const getPaypalClient = () => {
  if (!paypalClient && process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET) {
    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const { SandboxEnvironment, LiveEnvironment } = checkoutNodeJssdk.core;
    const { PayPalHttpClient } = checkoutNodeJssdk.core;

    const environment =
      process.env.NODE_ENV === 'production'
        ? new LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET)
        : new SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);

    paypalClient = new PayPalHttpClient(environment);
  }

  return paypalClient;
};

module.exports = {
  getPaypalClient,
};
