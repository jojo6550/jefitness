
/**
 * SubscriptionService.js
 * Centralized API calls for subscriptions
 */

const SubscriptionService = {
  getPlans: async () => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/plans`);
    return handleApiResponse(res);
  },

getCurrentSubscription: async () => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/current`,
      { credentials: 'include' }
    );
    return handleApiResponse(res);
  },

createCheckout: async (planId) => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ planId })
    });
    return handleApiResponse(res);
  },

  cancelSubscription: async (subscriptionId, atPeriodEnd = false) => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/cancel/${subscriptionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ atPeriodEnd })
      }
    );
    return handleApiResponse(res);
  },

verifySession: async (sessionId) => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/verify-session/${sessionId}`,
      {
        method: 'POST',
        credentials: 'include'
      }
    );
    return handleApiResponse(res);
  }
};

window.SubscriptionService = SubscriptionService;
