
/**
 * SubscriptionService.js
 * Centralized API calls for subscriptions
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

  createCheckout: async (planId, queueAfterCurrent = false) => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ plan: planId, queued: queueAfterCurrent })
    });
    return handle(res);
  },

  cancelQueuedPlan: async () => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/queued`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handle(res);
  },

  cancelSubscription: async (subscriptionId, atPeriodEnd = false) => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/cancel/${subscriptionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ atPeriodEnd })
    });
    return handle(res);
  },

  verifySession: async (sessionId) => {
    const res = await fetch(`${getApiBase()}/api/v1/subscriptions/verify-session/${sessionId}`, {
      method: 'POST',
      credentials: 'include'
    });
    return handle(res);
  }
};

window.SubscriptionService = SubscriptionService;
