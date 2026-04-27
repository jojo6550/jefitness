(function () {
  const { state, showAlert, log, DEBUG, getElement, safeShow, safeHide } = window.SubShared;

  let checkoutModal = null;

  function getModal() {
    if (!checkoutModal) {
      checkoutModal = new bootstrap.Modal(document.getElementById('checkoutModal'), {
        backdrop: 'static',
        keyboard: false,
      });
    }
    return checkoutModal;
  }

  async function selectPlan(planId) {
    state.selectedPlanId = planId;

    const plan = state.availablePlans.find(p => p.id === planId);
    if (!plan) {
      showAlert('Plan not found. Please refresh the page.', 'error');
      return;
    }

    // Update modal summary
    const planMeta = {
      '1-month':  '1 Month Plan',
      '3-month':  '3 Month Plan',
      '6-month':  '6 Month Plan',
      '12-month': '12 Month Plan',
    };
    document.getElementById('checkout-plan-name').textContent = planMeta[planId] || planId;
    document.getElementById('checkout-plan-price').textContent = window.SubShared.formatCurrency(plan.price || 0);

    // Reset modal state: show loading, hide buttons and error
    safeShow(getElement('checkout-loading'));
    safeHide(getElement('checkout-buttons'));
    safeHide(getElement('checkout-error'));
    document.getElementById('paypal-button-container').innerHTML = '';
    document.getElementById('card-button-container').innerHTML = '';

    getModal().show();

    try {
      const data = await SubscriptionService.createCheckout(planId);
      const orderId = data?.data?.orderId;
      if (!orderId) throw new Error('Failed to create payment order');

      safeHide(getElement('checkout-loading'));
      safeShow(getElement('checkout-buttons'));

      renderPayPalButtons(orderId);
    } catch (err) {
      if (DEBUG) console.error('Checkout init failed:', err);
      safeHide(getElement('checkout-loading'));
      const errMsg = getElement('checkout-error-msg');
      if (errMsg) errMsg.textContent = err.message || 'Failed to initialize checkout. Please try again.';
      safeShow(getElement('checkout-error'));
    }
  }

  function renderPayPalButtons(orderId) {
    const onApprove = async (data) => {
      safeHide(getElement('checkout-buttons'));
      safeShow(getElement('checkout-loading'));
      document.querySelector('#checkout-loading p').textContent = 'Verifying payment...';

      try {
        const result = await SubscriptionService.verifyPayment(data.orderID);
        if (result.success) {
          showAlert('Subscription activated successfully!', 'success');
          getModal().hide();
          await window.SubManager.loadUserSubscriptions();
        } else {
          showAlert('Payment verified. Subscription activated!', 'success');
          getModal().hide();
          await window.SubManager.loadUserSubscriptions();
        }
      } catch (err) {
        log('Verification failed:', err);
        showAlert('Payment received but verification failed. Please contact support.', 'warning');
        getModal().hide();
      }
    };

    const onError = (err) => {
      if (DEBUG) console.error('PayPal error:', err);
      showAlert('Payment failed. Please try again.', 'error');
    };

    const onCancel = () => {
      showAlert('Payment cancelled.', 'warning');
    };

    const createOrder = () => orderId;

    // PayPal wallet button
    if (window.paypal?.Buttons) {
      paypal.Buttons({
        createOrder,
        onApprove,
        onError,
        onCancel,
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'paypal',
          height: 48,
        },
        fundingSource: paypal.FUNDING.PAYPAL,
      }).render('#paypal-button-container');

      // Debit / Credit Card button
      paypal.Buttons({
        createOrder,
        onApprove,
        onError,
        onCancel,
        style: {
          layout: 'vertical',
          color: 'black',
          shape: 'rect',
          label: 'pay',
          height: 48,
        },
        fundingSource: paypal.FUNDING.CARD,
      }).render('#card-button-container');
    } else {
      showAlert('PayPal is not loaded. Please refresh the page.', 'error');
      getModal().hide();
    }
  }

  async function handleSuccessRedirect() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const orderId = params.get('token');
    const cancelled = params.get('cancelled');

    if (cancelled === 'true') {
      showAlert('Subscription purchase cancelled.', 'warning');
      return;
    }

    if (success === 'true' && orderId) {
      try {
        log('Verifying redirect payment:', orderId);
        showAlert('Verifying subscription purchase...', 'info');
        const data = await SubscriptionService.verifyPayment(orderId);
        if (data.success && data.data) {
          showAlert('Subscription activated successfully!', 'success');
        } else {
          showAlert('Purchase completed. Refreshing status...', 'info');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        await window.SubManager.loadUserSubscriptions();
      } catch (err) {
        log('Redirect verification failed:', err);
        showAlert('Verification failed. Please contact support if payment was taken.', 'warning');
        await window.SubManager.loadUserSubscriptions();
      }
    }
  }

  window.SubCheckout = { selectPlan, handleSuccessRedirect };
})();
