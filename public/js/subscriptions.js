window.API_BASE = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';

(function () {
  const { log } = window.SubShared;

  document.addEventListener('DOMContentLoaded', async () => {
    log('Subscriptions page loaded');

    document.getElementById('confirmCancelBtn')
      ?.addEventListener('click', window.SubManager.handleConfirmCancel);

    document.getElementById('cancelConfirmModal')
      ?.addEventListener('hide.bs.modal', () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const { action, subId } = btn.dataset;
      e.preventDefault();

      if (action === 'download-invoices') {
        await window.SubManager.downloadInvoices(subId);
      } else if (action === 'cancel-plan') {
        window.SubManager.openCancelModal(subId);
      } else if (action === 'cancel-queued') {
        await window.SubManager.cancelQueuedPlan();
      }
    });

    await window.SubPlansView.loadPlans();
    await window.SubCheckout.handleSuccessRedirect();
    await window.SubManager.loadUserSubscriptions();
  });
})();
