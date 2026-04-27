(function () {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const state = {
    currentViewAppointmentId: null,
    currentEditAppointmentId: null,
    userSubscriptionStatus: false,
  };

  const escapeHtml = (str) => {
    if (window.Validators?.escapeHtml) return window.Validators.escapeHtml(str);
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  };

  async function authFetch(url, options = {}) {
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };
    options.credentials = 'include';

    const res = await fetch(url, options);

    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'CONSENT_REQUIRED') {
        throw new Error('Data processing consent is required. Please update your privacy settings.');
      }
      const errMsg = typeof body.error === 'string'
        ? body.error
        : (body.error?.message || body.message || `HTTP 403 - Forbidden`);
      throw new Error(errMsg);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status} - ${errorText}`);
    }

    return res.json();
  }

  async function checkSubscriptionStatus() {
    try {
      const data = await authFetch(`${window.API_BASE}/api/v1/subscriptions/current`);
      const sub = data.data;

      if (!sub) {
        state.userSubscriptionStatus = false;
        return false;
      }

      const isPeriodValid = !sub.expiresAt || new Date(sub.expiresAt) > new Date();

      state.userSubscriptionStatus = sub.active && isPeriodValid;
      return state.userSubscriptionStatus;
    } catch (err) {
      if (isDev) console.error('Error checking subscription:', err);
      state.userSubscriptionStatus = false;
      return false;
    }
  }

  function showError(message) {
    const tbody = document.getElementById('appointmentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-danger py-4">
          <i class="bi bi-exclamation-triangle me-2"></i> ${escapeHtml(message)}
        </td>
      </tr>`;
  }

  function showConfirm(message, callback) {
    const confirmModalEl = document.getElementById('confirmModal');
    if (!confirmModalEl) {
      if (confirm(message)) callback();
      return;
    }

    const modalBody = document.getElementById('confirmModalBody');
    if (modalBody) modalBody.textContent = message;

    const confirmBtn = document.getElementById('confirmActionBtn');
    const modal = bootstrap.Modal.getOrCreateInstance(confirmModalEl);

    const onConfirm = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      modal.hide();
      callback();
    };

    const onHidden = () => {
      confirmBtn.blur();
      confirmModalEl.removeEventListener('hidden.bs.modal', onHidden);
    };

    confirmBtn.addEventListener('click', onConfirm);
    confirmModalEl.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
  }

  window.ApptShared = {
    isDev,
    state,
    escapeHtml,
    authFetch,
    checkSubscriptionStatus,
    showError,
    showConfirm,
  };
})();
