(function () {
  const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const state = {
    selectedPlanId: null,
    currentSubscriptionId: null,
    availablePlans: [],
    userSubscriptions: [],
    isLoadingSubscriptions: false,
  };

  const isActive = (status) => status === 'active';
  const isCancelled = (status) => status === 'cancelled';
  const isTrialing = (status) => status === 'trialing';

  function getElement(id, fallback = null) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} not found`);
    return el || fallback;
  }

  function safeShow(el) {
    if (!el) return false;
    el.classList.remove('d-none');
    return true;
  }

  function safeHide(el) {
    if (!el) return false;
    el.classList.add('d-none');
    return true;
  }

  async function handleApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text.slice(0, 500));
      throw new Error(`Server error (${response.status}). Please try again.`);
    }

    const data = await response.json();
    if (!response.ok) {
      let errorMsg = data?.message || (typeof data?.error === 'string' ? data.error : data?.error?.message) || `HTTP ${response.status}`;
      if (response.status === 400 && errorMsg.includes('price')) {
        errorMsg = 'Subscription plans temporarily unavailable. Please contact support.';
      } else if (response.status === 401) {
        errorMsg = 'Session expired. Please log in again.';
      } else if (response.status === 500) {
        errorMsg = 'Server error. Please try again in a moment.';
      }
      throw new Error(errorMsg);
    }

    return data;
  }

  function showAlert(message, type = 'info') {
    const alertContainer = getElement('alertContainer');
    if (!alertContainer) return;

    const icons = {
      success: 'bi-check-circle',
      error: 'bi-exclamation-circle',
      info: 'bi-info-circle',
      warning: 'bi-exclamation-triangle'
    };

    const div = document.createElement('div');
    div.className = `alert alert-${type} animate__animated animate__fadeIn`;

    const icon = document.createElement('i');
    icon.className = `bi ${icons[type] || icons.info} me-2`;
    div.appendChild(icon);
    div.appendChild(document.createTextNode(message));

    alertContainer.innerHTML = '';
    alertContainer.appendChild(div);

    setTimeout(() => {
      const alert = alertContainer.firstElementChild;
      if (!alert) return;
      alert.classList.add('animate__fadeOut');
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  }

  function log(...args) {
    if (DEBUG) console.log(...args);
  }

  function formatCurrency(amount, currency = 'JMD') {
    if (typeof amount !== 'number' || isNaN(amount)) return 'J$0.00';
    return new Intl.NumberFormat('en-JM', {
      style: 'currency',
      currency
    }).format(amount);
  }

  function parseDate(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'string') {
      const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(value);
      const d = new Date(hasTimezone ? value : value + 'Z');
      return isNaN(d.getTime()) ? fallback : d;
    }
    if (typeof value === 'number') {
      const timestamp = value > 10_000_000_000 ? value : value * 1000;
      return new Date(timestamp);
    }
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    return fallback;
  }

  function safeFormatDate(value) {
    if (!value || value === 0) return '—';
    const parsed = parseDate(value, null);
    return parsed && !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '—';
  }

  function hasActiveSubscription(planId = null) {
    return state.userSubscriptions.some(sub =>
      (isActive(sub.status) || isTrialing(sub.status)) &&
      (!planId || sub.plan === planId)
    );
  }

  window.SubShared = {
    DEBUG,
    state,
    isActive,
    isCancelled,
    isTrialing,
    getElement,
    safeShow,
    safeHide,
    handleApiResponse,
    showAlert,
    log,
    formatCurrency,
    parseDate,
    safeFormatDate,
    hasActiveSubscription,
  };
})();
