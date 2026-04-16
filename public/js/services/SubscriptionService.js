
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

createCheckout: async (planId, queueAfterCurrent = false) => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ planId, queueAfterCurrent })
    });
    return handleApiResponse(res);
  },

  cancelQueuedPlan: async () => {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/queued`, {
      method: 'DELETE',
      credentials: 'include',
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
