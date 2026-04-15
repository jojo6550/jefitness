/**
 * subscriptions.js - Updated for 1:1 subscription model with active/cancelled/trialing states
 */

/* --------------------------------------------------
   Config & Globals
-------------------------------------------------- */

window.API_BASE = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';

const STRIPE_PUBLIC_KEY = 'pk_live_51TD7A8DX2QubxH7TjPNbtQXIlI7mGKrDEwBrrov252MbWbTj9xGMhhlHKpGXQXPmUex2WOVb2kuiVzsqSKAQp36q00qAufxywd';

const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/** Updated for new model: active/trialing grant access */
const ACTIVE_STATUSES = ['active', 'trialing'];

let selectedPlanId = null;
let currentSubscriptionId = null;

let availablePlans = [];
let userSubscriptions = [];
let isLoadingSubscriptions = false;

/* --------------------------------------------------
   DOM Elements
-------------------------------------------------- */

const alertContainer = getElement('alertContainer');
const plansContainer = getElement('plansContainer');
const plansLoading = getElement('plansLoading');
const activeSubscriptionSection = getElement('activeSubscriptionSection');
const activeSubscriptionSummary = getElement('activeSubscriptionSummary');

/* --------------------------------------------------
   DOM Utilities - UNCHANGED
-------------------------------------------------- */

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

/* --------------------------------------------------
   Utilities - UNCHANGED except status logic
-------------------------------------------------- */

async function handleApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Non-JSON response:', text.slice(0, 500));
    throw new Error(`Server error (${response.status}). Please try again.`);
  }

  const data = await response.json();
  if (!response.ok) {
    let errorMsg = data?.message || data?.error?.message || `HTTP ${response.status}`;
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

/* --------------------------------------------------
   Plans - UNCHANGED logic
-------------------------------------------------- */

async function loadPlans() {
  try {
    const data = await SubscriptionService.getPlans();
    const plansObj = data?.data?.plans || {};
    availablePlans = Object.entries(plansObj).map(([id, plan]) => ({ id, ...plan }));
    renderPlans();
  } catch (err) {
    console.error('Load plans failed:', err);
    showAlert('Failed to load subscription plans', 'error');
  } finally {
    safeHide(plansLoading);
  }
}

function renderPlans() {
  if (!plansContainer) return;

  // Hide plans if active sub (new logic)
  if (userSubscriptions.some(sub => ACTIVE_STATUSES.includes(sub.status))) {
    safeHide(getElement('plansSection'));
    return;
  }

  plansContainer.innerHTML = '';

  const planDurations = {
    '1-month':  { months: 1,  displayName: '1 Month'   },
    '3-month':  { months: 3,  displayName: '3 Months'  },
    '6-month':  { months: 6,  displayName: '6 Months'  },
    '12-month': { months: 12, displayName: '12 Months' }
  };

  availablePlans.forEach(plan => {
    const isCurrent = hasActiveSubscription(plan.id);
    const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
    const durationInfo = planDurations[planId] || { months: 1, displayName: '1 Month' };

    const totalDollars = (plan.amount || 0) / 100;
    const monthlyDollars = totalDollars / durationInfo.months;

    const card = document.createElement('div');
    card.className = 'col-lg-3 col-md-6 col-12';
    card.innerHTML = `
      <div class="card h-100 plan-card ${isCurrent ? 'disabled-plan' : ''}">
        <div class="card-body d-flex flex-column justify-content-between h-100">
          <div>
            <div class="plan-duration mb-3">
              <span class="duration-badge">${durationInfo.displayName}</span>
            </div>
            <div class="plan-price mb-2">
              <div class="price-main">${formatCurrency(monthlyDollars)}</div>
              <div class="price-period">/month</div>
            </div>
            ${durationInfo.months > 1 ? `<div class="plan-total text-muted small">Total: ${formatCurrency(totalDollars)}</div>` : ''}
          </div>
          <button class="btn btn-primary plan-button w-100 mt-4" ${isCurrent ? 'disabled' : ''}>
            ${isCurrent ? 'Current Plan' : 'Subscribe Now'}
          </button>
        </div>
      </div>
    `;

    if (!isCurrent) {
      card.querySelector('button').onclick = () => selectPlan(plan.id);
    }

    plansContainer.appendChild(card);
  });

  plansContainer.classList.remove('d-none');
}

/* --------------------------------------------------
   Subscriptions - Updated status logic
-------------------------------------------------- */

function hasActiveSubscription(planId = null) {
  return userSubscriptions.some(sub =>
    ACTIVE_STATUSES.includes(sub.status) &&
    (!planId || sub.plan === planId)
  );
}

async function refreshSubscription() {
  try {
    log('Refreshing subscription...');
    const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/refresh`, {
      credentials: 'include'
    });

    const data = await handleApiResponse(response);
    log('Refresh response:', data);

    if (data.success && data.data) {
      userSubscriptions = [data.data];
      showAlert(data.message || 'Subscription refreshed!', 'success');
      renderActiveSubscriptionSummary();
      return true;
    } else {
      showAlert(data.message || 'No active subscription', 'info');
      userSubscriptions = [];
      safeShow(getElement('plansSection'));
      safeHide(activeSubscriptionSection);
      return false;
    }
  } catch (err) {
    console.error('Refresh failed:', err);
    showAlert(`Refresh failed: ${err.message}`, 'error');
    return false;
  }
}

async function loadUserSubscriptions() {
  if (isLoadingSubscriptions) return;
  isLoadingSubscriptions = true;

  try {
    log('Fetching subscription data...');
    const data = await SubscriptionService.getCurrentSubscription();
    log('Subscription data:', data);

    userSubscriptions = data?.data ? [data.data] : [];

    if (hasActiveSubscription()) {
      safeHide(getElement('plansSection'));
      safeShow(activeSubscriptionSection);
      renderActiveSubscriptionSummary();
    } else {
      safeShow(getElement('plansSection'));
      safeHide(activeSubscriptionSection);
    }
  } catch (err) {
    console.error('Load subscriptions failed:', err);
    safeShow(getElement('plansSection'));
    safeHide(activeSubscriptionSection);
  } finally {
    isLoadingSubscriptions = false;
  }
}

function renderActiveSubscriptionSummary() {
  if (!activeSubscriptionSummary) return;

  const sub = userSubscriptions[0];
  if (!sub) return;

  const planName = (sub.plan || 'Subscription').replace('-', ' ').toUpperCase();
  const periodEnd = parseDate(sub.currentPeriodEnd, new Date());
  const daysLeft = sub.daysLeft ?? 0;

  const isCancelled = sub.status === 'cancelled';
  const isActiveStatus = ACTIVE_STATUSES.includes(sub.status);
  const statusClass = isCancelled ? 'expired' : (isActiveStatus ? 'active' : 'warning');
  const statusText = sub.status.toUpperCase();

  activeSubscriptionSummary.innerHTML = `
    <div class="row g-4 align-items-center">
      <div class="col-lg-8">
        <div class="subscription-summary-card">
          <div class="subscription-header">
            <h3 class="subscription-title">${planName}</h3>
            <span class="status-badge status-${statusClass}">${statusText}</span>
          </div>
          <div class="subscription-details">
            <div class="detail-item">
              <span class="detail-label">Monthly Cost</span>
              <span class="detail-value">${formatCurrency((sub.amount || 0) / 100, sub.currency || 'JMD')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Expires</span>
              <span class="detail-value">${safeFormatDate(periodEnd)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Days Left</span>
              <span class="detail-value">${daysLeft > 0 ? `${daysLeft} days` : (daysLeft === 0 ? 'Today' : 'Expired')}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="actions-card">
          <h5 class="mb-3 fw-bold">Manage Plan</h5>
          ${sub.stripeSubscriptionId ? `<button data-action="download-invoices" data-sub-id="${sub.stripeSubscriptionId}" class="btn btn-outline-primary w-100 mb-2 btn-sm">
            <i class="bi bi-download me-2"></i>Download Invoices
          </button>` : ''}
          ${isActiveStatus ? `<button data-action="cancel-plan" class="btn btn-outline-danger w-100 btn-sm">
            <i class="bi bi-trash me-2"></i>Cancel Plan
          </button>` : `<button class="btn btn-outline-secondary w-100 btn-sm" disabled>
            <i class="bi bi-x-circle me-2"></i>${statusText}
          </button>`}
        </div>
      </div>
    </div>
  `;
}

/* --------------------------------------------------
   Plan Selection & Payment - UNCHANGED
-------------------------------------------------- */

async function selectPlan(planId) {
  selectedPlanId = planId;
  await loadUserSubscriptions();

  if (hasActiveSubscription(planId)) {
    showAlert('You already have this plan', 'warning');
    return;
  }

  showAlert('Redirecting to checkout...', 'info');
  try {
    const data = await SubscriptionService.createCheckout(planId);
    if (data?.data?.url) {
      setTimeout(() => { window.location.href = data.data.url; }, 800);
    } else {
      throw new Error('Invalid checkout response');
    }
  } catch (err) {
    console.error('Checkout failed:', err);
    showAlert(err.message || 'Checkout failed', 'error');
  }
}

/* --------------------------------------------------
   Manage - Updated for new model (no _id needed for cancel)
-------------------------------------------------- */

function openCancelModal() {
  const modal = new bootstrap.Modal(document.getElementById('cancelConfirmModal'));
  modal.show();
}

async function handleConfirmCancel() {
  const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

  try {
    await SubscriptionService.cancelSubscription(atPeriodEnd); // No ID needed (1:1)

    showAlert(atPeriodEnd ? 'Will end at period end' : 'Subscription cancelled', 'success');

    bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
    document.getElementById('atPeriodEndCheck').checked = false;
    setTimeout(loadUserSubscriptions, 1000);
  } catch (err) {
    console.error('Cancel failed:', err);
    showAlert(err.message, 'error');
  }
}

async function downloadInvoices(subId) {
  try {
    const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subId}/invoices`, { credentials: 'include' });
    const data = await handleApiResponse(response);
    if (!data.data?.length) {
      showAlert('No invoices found', 'info');
      return;
    }
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-info alert-dismissible fade show';
    alertDiv.appendChild(renderInvoiceList(data.data));
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close';
    closeBtn.setAttribute('data-bs-dismiss', 'alert');
    alertDiv.appendChild(closeBtn);
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
  } catch (err) {
    console.error('Invoices failed:', err);
    showAlert('Failed to load invoices', 'error');
  }
}

function renderInvoiceList(invoices) {
  const container = document.createElement('div');
  container.className = 'invoices-scroll-container';

  const heading = document.createElement('h5');
  heading.className = 'mb-3';
  heading.textContent = 'Recent Invoices';
  container.appendChild(heading);

  invoices.forEach(invoice => {
    const pdfUrl = invoice.invoice_pdf || invoice.hosted_invoice_url;
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

/* --------------------------------------------------
   Init - Updated event handlers
-------------------------------------------------- */

async function handleSuccessRedirect() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('success');
  const sessionId = params.get('session_id');
  const canceled = params.get('canceled');

  if (canceled === 'true') {
    showAlert('Purchase cancelled.', 'warning');
    return;
  }

  if (success === 'true' && sessionId) {
    try {
      log('Verifying session:', sessionId);
      showAlert('Verifying purchase...', 'info');
      const data = await SubscriptionService.verifySession(sessionId);

      if (data.success && data.data) {
        showAlert(`Activated: ${data.data.plan.replace('-', ' ')} plan!`, 'success');
        userSubscriptions = [data.data];
        safeHide(getElement('plansSection'));
        safeShow(activeSubscriptionSection);
        renderActiveSubscriptionSummary();
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        showAlert('Purchase complete, refreshing...', 'info');
        await loadUserSubscriptions();
      }
    } catch (err) {
      log('Verification failed:', err);
      showAlert('Verification failed, refreshing...', 'warning');
      await loadUserSubscriptions();
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  log('Subscriptions page loaded');

  document.getElementById('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);

  document.getElementById('cancelConfirmModal')?.addEventListener('hide.bs.modal', () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, subId } = btn.dataset;
    e.preventDefault();

    if (action === 'download-invoices') {
      await downloadInvoices(subId);
    } else if (action === 'cancel-plan') {
      openCancelModal();
    }
  });

  await loadPlans();
  await handleSuccessRedirect();
  await loadUserSubscriptions();
});

