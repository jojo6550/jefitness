(function () {
  const { state, showAlert, log, DEBUG } = window.SubShared;

  async function selectPlan(planId) {
    state.selectedPlanId = planId;

    showAlert('Redirecting to secure checkout...', 'info');
    try {
      const data = await SubscriptionService.createCheckout(planId);
      if (data?.data?.approvalLink) {
        setTimeout(() => { window.location.href = data.data.approvalLink; }, 800);
      } else {
        throw new Error('Invalid checkout response');
      }
    } catch (err) {
      if (DEBUG) console.error('Checkout failed:', err);
      showAlert(err.message || 'Checkout failed. Please try again.', 'error');
    }
  }

  async function handleSuccessRedirect() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const orderId = params.get('session_id');
    const cancelled = params.get('cancelled');

    if (cancelled === 'true') {
      showAlert('Subscription purchase cancelled.', 'warning');
      return;
    }

    if (success === 'true' && orderId) {
      try {
        log('Verifying payment:', orderId);
        showAlert('Verifying subscription purchase...', 'info');
        const data = await SubscriptionService.verifyPayment(orderId);

        if (data.success && data.data) {
          showAlert('Subscription activated successfully!', 'success');
          window.history.replaceState({}, document.title, window.location.pathname);
          await window.SubManager.loadUserSubscriptions();
        } else {
          showAlert('Purchase completed. Refreshing status...', 'info');
          await window.SubManager.loadUserSubscriptions();
        }
      } catch (err) {
        log('Payment verification failed:', err);
        showAlert('Verification failed. Status will refresh automatically.', 'warning');
        await window.SubManager.loadUserSubscriptions();
      }
    }
  }

  window.SubCheckout = { selectPlan, handleSuccessRedirect };
})();
