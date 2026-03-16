
/**
 * SubscriptionService.js
 * Centralized API calls for subscriptions
 */

const SubscriptionService = {
  getPlans: async () => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/plans`);
    return handleApiResponse(res);
  },

  getCurrentSubscription: async (userToken) => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/current`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    return handleApiResponse(res);
  },

  createCheckout: async (userToken, planId) => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ planId })
    });
    return handleApiResponse(res);
  },

  cancelSubscription: async (userToken, subscriptionId) => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/cancel/${subscriptionId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        }
      }
    );
    return handleApiResponse(res);
  },

  verifySession: async (userToken, sessionId) => {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/verify-session/${sessionId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    );
    return handleApiResponse(res);
  }
};

window.SubscriptionService = SubscriptionService;
