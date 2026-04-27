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

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.action === 'cancel-plan') {
        window.SubManager.openCancelModal();
      }
    });

    await window.SubPlansView.loadPlans();
    await window.SubCheckout.handleSuccessRedirect();
    await window.SubManager.loadUserSubscriptions();
  });
})();
