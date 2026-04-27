(function () {
  const {
    state,
    getElement,
    safeShow,
    safeHide,
    showAlert,
    log,
    formatCurrency,
    parseDate,
    safeFormatDate,
    hasActiveSubscription,
    DEBUG,
  } = window.SubShared;

  async function loadUserSubscriptions() {
    if (state.isLoadingSubscriptions) return;
    state.isLoadingSubscriptions = true;

    try {
      log('Fetching subscription data...');
      const data = await SubscriptionService.getCurrentSubscription();
      log('Subscription data:', data);

      state.userSubscriptions = data?.data?._id ? [data.data] : [];

      if (hasActiveSubscription()) {
        safeShow(getElement('activeSubscriptionSection'));
        renderActiveSubscriptionSummary();
        window.SubPlansView.renderPlans();
      } else {
        safeHide(getElement('activeSubscriptionSection'));
        safeShow(getElement('plansSection'));
        window.SubPlansView.renderPlans();
      }
    } catch (err) {
      if (DEBUG) console.error('Load subscriptions failed:', err);
      safeHide(getElement('activeSubscriptionSection'));
      safeShow(getElement('plansSection'));
    } finally {
      state.isLoadingSubscriptions = false;
    }
  }

  function renderActiveSubscriptionSummary() {
    const container = getElement('activeSubscriptionSummary');
    if (!container) return;

    const sub = state.userSubscriptions[0];
    if (!sub) return;

    const expiresAt = parseDate(sub.expiresAt, new Date(Date.now() + 30 * 86_400_000));
    const daysLeft = sub.daysLeft ?? 0;
    const isActiveNow = sub.active && expiresAt > new Date();

    const statusClass = isActiveNow ? 'active' : 'expired';
    const statusText = isActiveNow ? 'ACTIVE' : 'EXPIRED';

    container.innerHTML = `
      <div class="row g-4 align-items-center">
        <div class="col-lg-8">
          <div class="subscription-summary-card">
            <div class="subscription-header">
              <h3 class="subscription-title">Subscription</h3>
              <span class="status-badge status-${statusClass}">${statusText}</span>
            </div>
            <div class="subscription-details">
              <div class="detail-item">
                <span class="detail-label">Cost</span>
                <span class="detail-value">${formatCurrency(sub.amount || 0, sub.currency || 'USD')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Expires</span>
                <span class="detail-value">${safeFormatDate(expiresAt)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Days Remaining</span>
                <span class="detail-value">${daysLeft > 0 ? `${daysLeft} days` : 'Expired'}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="actions-card">
            <h5 class="mb-3 fw-bold">Manage</h5>
            ${isActiveNow
              ? `<button data-action="cancel-plan" class="btn btn-outline-danger w-100 btn-sm">
                  <i class="bi bi-x-circle me-2"></i>Cancel Subscription
                 </button>`
              : `<button class="btn btn-outline-secondary w-100 btn-sm" disabled>
                  <i class="bi bi-clock me-2"></i>Subscription Expired
                 </button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function openCancelModal() {
    if (!state.userSubscriptions[0]) {
      showAlert('No active subscription found', 'error');
      return;
    }
    new bootstrap.Modal(document.getElementById('cancelConfirmModal')).show();
  }

  async function handleConfirmCancel() {
    const btn = document.getElementById('confirmCancelBtn');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }

    try {
      await SubscriptionService.cancelSubscription();
      showAlert('Subscription cancelled successfully.', 'success');
      bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal'))?.hide();
      setTimeout(loadUserSubscriptions, 1000);
    } catch (err) {
      if (DEBUG) console.error('Cancel failed:', err);
      showAlert(err.message || 'Failed to cancel. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  window.SubManager = {
    loadUserSubscriptions,
    renderActiveSubscriptionSummary,
    openCancelModal,
    handleConfirmCancel,
  };
})();
