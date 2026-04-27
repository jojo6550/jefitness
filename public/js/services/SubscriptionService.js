/**
 * SubscriptionService.js
 * Centralized API calls for subscriptions (PayPal one-time payments)
 */

const getApiBase = () => window.ApiConfig ? window.ApiConfig.getAPI_BASE() : (window.API_BASE || '/api');

const handle = (res) => {
  if (!window.SubShared || typeof window.SubShared.handleApiResponse !== 'function') {
    throw new Error('SubShared not loaded. Ensure subscriptions/shared.js loads before SubscriptionService callers.');
  }
  return window.SubShared.handleApiResponse(res);
};

const SubscriptionService = {
  getPlans: async () => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/plans`, { credentials: 'include' });
    return handle(res);
  },

  getCurrentSubscription: async () => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/current`, { credentials: 'include' });
    return handle(res);
  },

  createCheckout: async (planId) => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ plan: planId })
    });
    return handle(res);
  },

  verifyPayment: async (orderId) => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/verify-payment/${orderId}`, {
      method: 'POST',
      credentials: 'include'
    });
    return handle(res);
  },

  cancelSubscription: async () => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/cancel`, {
      method: 'POST',
      credentials: 'include'
    });
    return handle(res);
  }
};

window.SubscriptionService = SubscriptionService;
