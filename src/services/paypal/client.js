const https = require('https');

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

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getAccessToken() {
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const body = 'grant_type=client_credentials';
  const hostname = process.env.NODE_ENV === 'production' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path: '/v1/oauth2/token', method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw).access_token); } catch { reject(new Error('Token parse failed')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function verifyWebhookSignature(headers, body, webhookId) {
  const hostname = process.env.NODE_ENV === 'production' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
  const token = await getAccessToken();
  const payload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: body,
  };
  const result = await httpsPost(hostname, '/v1/notifications/verify-webhook-signature', payload, {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });
  return result.body?.verification_status === 'SUCCESS';
}

module.exports = {
  getPaypalClient,
  verifyWebhookSignature,
};
