(function () {
  const {
    state,
    getElement,
    safeShow,
    safeHide,
    handleApiResponse,
    showAlert,
    log,
    formatCurrency,
    parseDate,
    safeFormatDate,
    isActive,
    isCancelled,
    isTrialing,
    hasActiveSubscription,
    DEBUG,
  } = window.SubShared;

  async function loadUserSubscriptions() {
    if (state.isLoadingSubscriptions) {
      log('loadUserSubscriptions - already loading, skipping');
      return;
    }

    state.isLoadingSubscriptions = true;

    try {
      log('Fetching subscription data...');
      const data = await SubscriptionService.getCurrentSubscription();
      log('Subscription data:', data);

      state.userSubscriptions = data?.data?._id ? [data.data] : [];

      log('userSubscriptions after load:', state.userSubscriptions);
      log('hasActiveSubscription:', hasActiveSubscription());

      if (hasActiveSubscription()) {
        safeShow(getElement('activeSubscriptionSection'));
        renderActiveSubscriptionSummary();
        window.SubPlansView.renderPlans();
      } else {
        safeShow(getElement('plansSection'));
        safeHide(getElement('activeSubscriptionSection'));
        window.SubPlansView.renderPlans();
      }
    } catch (err) {
      if (DEBUG) console.error('Load subscriptions failed:', err);
      safeShow(getElement('plansSection'));
      safeHide(getElement('activeSubscriptionSection'));
    } finally {
      state.isLoadingSubscriptions = false;
    }
  }

  function renderActiveSubscriptionSummary() {
    const activeSubscriptionSummary = getElement('activeSubscriptionSummary');
    if (!activeSubscriptionSummary) return;

    const sub = state.userSubscriptions[0];
    if (!sub) return;

    const expiresAt = parseDate(sub.expiresAt, new Date(Date.now() + 30 * 86_400_000));
    const daysLeft = sub.daysLeft ?? 0;
    const isActive = sub.active && expiresAt > new Date();

    const statusClass = isActive ? 'active' : 'expired';
    const statusText = isActive ? 'ACTIVE' : 'EXPIRED';

    activeSubscriptionSummary.innerHTML = `
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
            ${isActive
              ? `<button data-action="cancel-plan" data-sub-id="${sub._id}" class="btn btn-outline-danger w-100 btn-sm">
                  <i class="bi bi-trash me-2"></i>Cancel
                 </button>`
              : `<button class="btn btn-outline-secondary w-100 btn-sm" disabled>
                  <i class="bi bi-x-circle me-2"></i>Expired
                 </button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function openCancelModal(subscriptionId) {
    state.currentSubscriptionId = subscriptionId;

    if (!state.currentSubscriptionId) {
      showAlert('Subscription not found', 'error');
      return;
    }

    const modal = new bootstrap.Modal(document.getElementById('cancelConfirmModal'));
    modal.show();
  }

  async function cancelQueuedPlan() {
    try {
      await SubscriptionService.cancelQueuedPlan();
      showAlert('Queued plan removed', 'success');
      setTimeout(loadUserSubscriptions, 800);
    } catch (err) {
      if (DEBUG) console.error('Cancel queued plan failed:', err);
      showAlert(err.message || 'Failed to remove queued plan', 'error');
    }
  }

  function renewSubscription() {
    showAlert('Redirecting you to select a new plan...', 'info');
    state.userSubscriptions = [];
    window.SubPlansView.renderPlans();

    const plansSection = document.querySelector('.plans-container-wrapper');
    if (plansSection) plansSection.scrollIntoView({ behavior: 'smooth' });
  }

  async function fetchInvoices(subscriptionId) {
    const apiBase = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';
    const res = await fetch(
      `${apiBase}/api/v1/subscriptions/${subscriptionId}/invoices`,
      { credentials: 'include' }
    );
    const data = await handleApiResponse(res);
    return data.data || [];
  }

  function renderInvoiceList(invoices) {
    const container = document.createElement('div');
    container.className = 'invoices-scroll-container';

    const heading = document.createElement('h5');
    heading.className = 'mb-3';
    heading.textContent = 'Recent Invoices';
    container.appendChild(heading);

    invoices.forEach(invoice => {
      const pdfUrl = invoice.pdf_url || invoice.invoice_pdf || invoice.hosted_invoice_url;
      if (!pdfUrl) return;

      const date = parseDate(invoice.created, new Date()).toLocaleDateString();
      const amount = formatCurrency((invoice.amount_paid || invoice.total || 0) / 100, invoice.currency || 'JMD');
      const status = invoice.status === 'paid' ? '✓ Paid' : 'Pending';
      const invoiceLabel = 'Invoice #' + (invoice.number || invoice.id.slice(-8));

      const row = document.createElement('div');
      row.className = 'mb-2 p-2 border-bottom';

      const inner = document.createElement('div');
      inner.className = 'd-flex justify-content-between align-items-center';

      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = invoiceLabel;
      const meta = document.createElement('div');
      meta.className = 'small text-muted';
      meta.textContent = `${date} - ${amount} - ${status}`;
      info.appendChild(strong);
      info.appendChild(meta);

      const link = document.createElement('a');
      link.href = pdfUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'btn btn-sm btn-outline-primary';
      link.textContent = 'Download';

      inner.appendChild(info);
      inner.appendChild(link);
      row.appendChild(inner);
      container.appendChild(row);
    });

    return container;
  }

  async function downloadInvoices(subscriptionId) {
    const alertContainer = getElement('alertContainer');
    try {
      const invoices = await fetchInvoices(subscriptionId);
      if (!invoices.length) {
        showAlert('No invoices found for this subscription', 'info');
        return;
      }
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-info alert-dismissible fade show';
      alertDiv.appendChild(renderInvoiceList(invoices));
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn-close';
      closeBtn.setAttribute('data-bs-dismiss', 'alert');
      closeBtn.setAttribute('aria-label', 'Close');
      alertDiv.appendChild(closeBtn);
      if (alertContainer) {
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
      }
    } catch (err) {
      console.error('Download invoices failed:', err);
      showAlert('Failed to load invoices: ' + err.message, 'error');
    }
  }

  async function handleConfirmCancel() {
    if (!state.currentSubscriptionId) {
      showAlert('Subscription not found', 'error');
      return;
    }

    const btn = document.getElementById('confirmCancelBtn');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }

    const atPeriodEnd = document.getElementById('atPeriodEndCheck')?.checked ?? false;

    try {
      await SubscriptionService.cancelSubscription(state.currentSubscriptionId, atPeriodEnd);

      showAlert(
        atPeriodEnd ? 'Subscription will end at period end' : 'Subscription cancelled',
        'success'
      );

      bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
      if (document.getElementById('atPeriodEndCheck')) {
        document.getElementById('atPeriodEndCheck').checked = false;
      }
      setTimeout(loadUserSubscriptions, 1000);
    } catch (err) {
      if (DEBUG) console.error('Cancel failed:', err);
      showAlert(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  window.SubManager = {
    loadUserSubscriptions,
    renderActiveSubscriptionSummary,
    openCancelModal,
    cancelQueuedPlan,
    renewSubscription,
    downloadInvoices,
    handleConfirmCancel,
  };
})();
