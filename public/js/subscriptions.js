/**
 * subscriptions.js
 * Handles subscription plans, Stripe payments, and user subscriptions
 */

/* --------------------------------------------------
   Config & Globals
-------------------------------------------------- */

window.API_BASE = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';

const STRIPE_PUBLIC_KEY = 'pk_live_51TD7A8DX2QubxH7TjPNbtQXIlI7mGKrDEwBrrov252MbWbTj9xGMhhlHKpGXQXPmUex2WOVb2kuiVzsqSKAQp36q00qAufxywd';


const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/** 3-state subscription model: active, trialing, cancelled */
const isActive = (status) => status === 'active';
const isCancelled = (status) => status === 'cancelled';
const isTrialing = (status) => status === 'trialing';

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
   DOM Utilities
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
   Utilities
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

/**
 * Format a number as USD currency string.
 * @param {number} amount - Amount in dollars
 * @returns {string} e.g. "$29.99"
 */
function formatCurrency(amount, currency = 'JMD') {
  if (typeof amount !== 'number' || isNaN(amount)) return 'J$0.00';
  return new Intl.NumberFormat('en-JM', { 
    style: 'currency', 
    currency 
  }).format(amount);
}

/**
 * Parse a date value into a Date object, returning `fallback` on failure.
 * Handles ISO strings, Unix timestamps (seconds or ms), and Date instances.
 */
function parseDate(value, fallback) {
  if (!value) return fallback;
  // Always parse as UTC to match backend storage
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

/**
 * Safely format timestamp/Date/string to YYYY-MM-DD for display.
 * Returns '—' when value is missing or unparseable, so the UI never shows
 * a misleading "today" date for subscriptions with no period data.
 */
function safeFormatDate(value) {
  if (!value || value === 0) return '—';
  const parsed = parseDate(value, null);
  return parsed && !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '—';
}


/* --------------------------------------------------
   Plans
-------------------------------------------------- */

async function loadPlans() {
  try {
    const data = await SubscriptionService.getPlans();
    const plansObj = data?.data?.plans || {};
    // API returns a keyed object; convert to array with id field for rendering
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

  // Check for truly active/trialing subs (not queued plans)
  const activeSub = userSubscriptions.find(sub => (isActive(sub.status) || isTrialing(sub.status)) && !sub.isQueuedPlan);

  // If active sub has a queued plan, hide plans section entirely (user already committed to next plan)
  if (activeSub?.queuedPlan) {
    safeHide(getElement('plansSection'));
    return;
  }

  // If no active sub, show normal subscribe view
  const isQueueMode = !!activeSub;
  const queueStartDate = isQueueMode ? safeFormatDate(activeSub.currentPeriodEnd) : null;

  plansContainer.innerHTML = '';

  const planDurations = {
    '1-month':  { months: 1,  displayName: '1 Month'   },
    '3-month':  { months: 3,  displayName: '3 Months'  },
    '6-month':  { months: 6,  displayName: '6 Months'  },
    '12-month': { months: 12, displayName: '12 Months' }
  };

  availablePlans.forEach(plan => {
    const isCurrent = !isQueueMode && hasActiveSubscription(plan.id);
    const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
    const durationInfo = planDurations[planId] || { months: 1, displayName: '1 Month' };

    // plan.amount is total amount in cents for the entire subscription period
    const totalDollars = (plan.amount || 0) / 100;
    const monthlyDollars = totalDollars / durationInfo.months;

    let buttonLabel;
    if (isCurrent) {
      buttonLabel = 'Current Plan';
    } else if (isQueueMode) {
      buttonLabel = `Queue for ${queueStartDate}`;
    } else {
      buttonLabel = 'Subscribe Now';
    }

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
            ${buttonLabel}
          </button>
        </div>
      </div>
    `;

    if (!isCurrent) {
      card.querySelector('button').onclick = () => selectPlan(plan.id, isQueueMode);
    }

    plansContainer.appendChild(card);
  });

  plansContainer.classList.remove('d-none');

  // If queue mode, show plans section alongside the active sub section
  if (isQueueMode) {
    safeShow(getElement('plansSection'));
  }
}

/* --------------------------------------------------
   Subscriptions
-------------------------------------------------- */

function hasActiveSubscription(planId = null) {
  return userSubscriptions.some(sub =>
    (isActive(sub.status) || isTrialing(sub.status)) &&
    (!planId || sub.plan === planId)
  );
}

async function refreshSubscription() {
  try {
    log('Refreshing subscription from Stripe...');
    const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/refresh`, {
      credentials: 'include'
    });

    const data = await handleApiResponse(response);
    log('Refresh response:', data);

    if (data.success && data.data) {
      userSubscriptions = [data.data];
      showAlert(data.message || 'Subscription refreshed successfully!', 'success');
      renderActiveSubscriptionSummary();
      return true;
    } else {
      showAlert(data.message || 'No subscription found in Stripe', 'info');
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
  if (isLoadingSubscriptions) {
    log('loadUserSubscriptions - already loading, skipping');
    return;
  }

  isLoadingSubscriptions = true;

  try {
    log('Fetching subscription data...');
    const data = await SubscriptionService.getCurrentSubscription();
    log('Subscription data:', data);

    userSubscriptions = data?.data?._id ? [data.data] : [];

    log('userSubscriptions after load:', userSubscriptions);
    log('hasActiveSubscription:', hasActiveSubscription());

    if (hasActiveSubscription()) {
      safeShow(activeSubscriptionSection);
      renderActiveSubscriptionSummary();
      renderPlans(); // renderPlans handles show/hide of plansSection based on queue state
    } else {
      safeShow(getElement('plansSection'));
      safeHide(activeSubscriptionSection);
      renderPlans();
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

  const defaultEnd = new Date(Date.now() + 30 * 86_400_000);
  const periodEnd = parseDate(sub.currentPeriodEnd, defaultEnd);
  const daysLeft = sub.daysLeft ?? 0;

  const subStatus = sub.status;
  const isSubActive = isActive(subStatus);
  const isSubCancelled = isCancelled(subStatus);
  const isSubTrialing = isTrialing(subStatus);

  let statusClass, statusText;
  if (isSubActive) {
    statusClass = 'active';
    statusText = 'ACTIVE';
  } else if (isSubTrialing) {
    statusClass = 'warning';
    statusText = 'TRIALING';
  } else if (isSubCancelled) {
    statusClass = 'expired';
    statusText = 'CANCELLED';
  } else {
    statusClass = 'expired';
    statusText = 'UNKNOWN';
  }

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
              <span class="detail-label">Next Billing Date</span>
            <span class="detail-value">${safeFormatDate(periodEnd)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Days Remaining</span>
<span class="detail-value">${daysLeft > 0 ? `${daysLeft} days` : (daysLeft === 0 ? 'Renews Today' : 'Expired')}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="actions-card">
          <h5 class="mb-3 fw-bold">Manage Your Plan</h5>
          <button data-action="download-invoices" data-sub-id="${sub.stripeSubscriptionId}" class="btn btn-outline-primary w-100 mb-2 btn-sm">
            <i class="bi bi-download me-2"></i>Download Invoices
          </button>
          ${!isSubCancelled && sub.stripeSubscriptionId
            ? `<button data-action="cancel-plan" data-sub-id="${sub._id}" class="btn btn-outline-danger w-100 btn-sm">
                <i class="bi bi-trash me-2"></i>Cancel Plan
               </button>`
            : (isSubCancelled
                ? `<button class="btn btn-outline-secondary w-100 btn-sm" disabled>
                    <i class="bi bi-x-circle me-2"></i>Plan Cancelled
                   </button>`
                : `<button class="btn btn-outline-warning w-100 btn-sm" disabled title="Subscription incomplete - contact support">
                    <i class="bi bi-exclamation-triangle me-2"></i>Incomplete Subscription
                   </button>`)
          }
          ${sub.queuedPlan
            ? `<div class="mt-3 p-2 border rounded bg-light">
                 <small class="text-muted d-block mb-1">Next Plan</small>
                 <div class="d-flex align-items-center justify-content-between">
                   <div>
                     <strong>${(sub.queuedPlan.plan || '').replace('-', ' ').toUpperCase()}</strong>
                     <div class="text-muted small">Starts ${safeFormatDate(sub.queuedPlan.currentPeriodEnd)}</div>
                   </div>
                   <button data-action="cancel-queued" data-sub-id="${sub.queuedPlan._id}" class="btn btn-outline-danger btn-sm ms-2" title="Remove queued plan">
                     <i class="bi bi-x"></i>
                   </button>
                 </div>
               </div>`
            : ''
          }
        </div>
      </div>
    </div>
  `;
}

/* --------------------------------------------------
   Plan Selection & Payment
-------------------------------------------------- */

async function selectPlan(planId, queueAfterCurrent = false) {
  selectedPlanId = planId;

  await loadUserSubscriptions();

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
    if (data?.data?.url) {
      setTimeout(() => { window.location.href = data.data.url; }, 800);
    } else {
      throw new Error('Invalid checkout response');
    }
  } catch (err) {
    console.error('Direct checkout failed:', err);
    showAlert(err.message || 'Checkout failed. Please try again.', 'error');
  }
}

/* --------------------------------------------------
   Manage Subscription (Cancel, Renew, Invoices)
-------------------------------------------------- */

function openCancelModal(subscriptionId) {
  currentSubscriptionId = subscriptionId;

  if (!currentSubscriptionId) {
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
    console.error('Cancel queued plan failed:', err);
    showAlert(err.message || 'Failed to remove queued plan', 'error');
  }
}

function renewSubscription() {
  showAlert('Redirecting you to select a new plan...', 'info');
  userSubscriptions = [];
  renderPlans();

  const plansSection = document.querySelector('.plans-container-wrapper');
  if (plansSection) plansSection.scrollIntoView({ behavior: 'smooth' });
}

/** Fetch invoices for a subscription from the API */
async function fetchInvoices(subscriptionId) {
  const apiBase = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';
  const res = await fetch(
    `${apiBase}/api/v1/subscriptions/${subscriptionId}/invoices`,
    { credentials: 'include' }
  );
  const data = await handleApiResponse(res);
  return data.data || [];
}

/** Build the invoice list DOM node from an array of invoice objects.
 *  Uses textContent for all dynamic data to prevent XSS. */
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

/** Fetch and display invoices for a subscription */
async function downloadInvoices(subscriptionId) {
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
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
  } catch (err) {
    console.error('Download invoices failed:', err);
    showAlert('Failed to load invoices: ' + err.message, 'error');
  }
}

async function handleConfirmCancel() {
  if (!currentSubscriptionId) {
    showAlert('Subscription not found', 'error');
    return;
  }

  const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

  try {
    await SubscriptionService.cancelSubscription(currentSubscriptionId, atPeriodEnd);

    showAlert(
      atPeriodEnd ? 'Subscription will end at period end' : 'Subscription canceled',
      'success'
    );

    bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
    document.getElementById('atPeriodEndCheck').checked = false;
    setTimeout(loadUserSubscriptions, 1000);
  } catch (err) {
    console.error('Cancel failed:', err);
    showAlert(err.message, 'error');
  }
}

/* --------------------------------------------------
   Init
-------------------------------------------------- */

async function handleSuccessRedirect() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('success');
  const sessionId = params.get('session_id');
  const canceled = params.get('canceled');

  if (canceled === 'true') {
    showAlert('Subscription purchase canceled.', 'warning');
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
        await loadUserSubscriptions();
      } else {
        showAlert('Purchase completed but subscription not yet active. Refreshing status...', 'info');
        await loadUserSubscriptions();
      }
    } catch (err) {
      log('Session verification failed:', err);
      showAlert('Verification failed. Status will refresh automatically.', 'warning');
      await loadUserSubscriptions();
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  log('Subscriptions page loaded');

  document.getElementById('confirmCancelBtn')
    ?.addEventListener('click', handleConfirmCancel);

  // Move focus out of the modal before Bootstrap applies aria-hidden (accessibility)
  document.getElementById('cancelConfirmModal')
    ?.addEventListener('hide.bs.modal', () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

  // Global event delegation for dynamically rendered subscription buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, subId } = btn.dataset;
    e.preventDefault();

    if (action === 'download-invoices') {
      await downloadInvoices(subId);
    } else if (action === 'cancel-plan') {
      openCancelModal(subId);
    } else if (action === 'cancel-queued') {
      await cancelQueuedPlan();
    }
  });

  await loadPlans();
  await handleSuccessRedirect();
  await loadUserSubscriptions();
});
