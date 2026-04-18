(function () {
  const {
    state,
    showAlert,
    log,
    hasActiveSubscription,
    DEBUG,
  } = window.SubShared;

  async function selectPlan(planId, queueAfterCurrent = false) {
    state.selectedPlanId = planId;

    if (!queueAfterCurrent && hasActiveSubscription(planId)) {
      showAlert('You already have this plan', 'warning');
      return;
    }

    showAlert(
      queueAfterCurrent
        ? 'Redirecting to set up your next plan...'
        : 'Redirecting to secure checkout...',
      'info'
    );
    try {
      const data = await SubscriptionService.createCheckout(planId, queueAfterCurrent);
      if (data?.url) {
        setTimeout(() => { window.location.href = data.url; }, 800);
      } else {
        throw new Error('Invalid checkout response');
      }
    } catch (err) {
      if (DEBUG) console.error('Direct checkout failed:', err);
      showAlert(err.message || 'Checkout failed. Please try again.', 'error');
    }
  }

  async function handleSuccessRedirect() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled');

    if (cancelled === 'true') {
      showAlert('Subscription purchase cancelled.', 'warning');
      return;
    }

    if (success === 'true' && sessionId) {
      try {
        log('Verifying checkout session:', sessionId);
        showAlert('Verifying subscription purchase...', 'info');
        const data = await SubscriptionService.verifySession(sessionId);

        if (data.success && data.data) {
          if (data.data.isQueuedPlan) {
            showAlert(`${data.data.plan.replace('-', ' ')} plan queued — starts when your current plan ends.`, 'success');
          } else {
            showAlert(`Subscription activated successfully! ${data.data.plan.replace('-', ' ')} plan.`, 'success');
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          await window.SubManager.loadUserSubscriptions();
        } else {
          showAlert('Purchase completed but subscription not yet active. Refreshing status...', 'info');
          await window.SubManager.loadUserSubscriptions();
        }
      } catch (err) {
        log('Session verification failed:', err);
        showAlert('Verification failed. Status will refresh automatically.', 'warning');
        await window.SubManager.loadUserSubscriptions();
      }
    }
  }

  window.SubCheckout = { selectPlan, handleSuccessRedirect };
})();
