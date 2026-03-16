/**
 * subscriptions.js
 * Handles subscription plans, Stripe payments, and user subscriptions
 */

/* --------------------------------------------------
   Config & Globals
-------------------------------------------------- */

window.API_BASE = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';

const STRIPE_PUBLIC_KEY =
  'pk_test_51NfYT7GBrdnKY4igMADzsKlYvumrey4zqRBIcMAjzd9gvm0a3TW8rUFDaSPhvAkhXPzDcmoay4V07NeIt4EZbR5N00AhS8rNXk';

const stripe = Stripe(STRIPE_PUBLIC_KEY);
const DEBUG = true;

let selectedPlanId = null;
let cardElement = null;
let currentSubscriptionId = null;
// Don't cache userToken at module load - get it fresh when needed
// let userToken = localStorage.getItem('token');

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
   DOM Utilities - Safe element access
-------------------------------------------------- */

function getElement(id, fallback = null) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Element #${id} not found`);
    return fallback;
  }
  return el;
}

function safeShow(el) {
  if (!el) { console.warn('Cannot show null element'); return false; }
  el.classList.remove('d-none');
  return true;
}

function safeHide(el) {
  if (!el) { console.warn('Cannot hide null element'); return false; }
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
    // Enhanced error messages for common cases
    let errorMsg = data?.error?.message || `HTTP ${response.status}`;
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

  alertContainer.innerHTML = `
    <div class="alert alert-${type} animate__animated animate__fadeIn">
      <i class="bi ${icons[type] || icons.info} me-2"></i>
      ${message}
    </div>
  `;

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
 * Format a number as currency with commas
 * @param {number} amount - Amount in dollars
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0.00';
  }
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* --------------------------------------------------
   Stripe Elements
-------------------------------------------------- */

function initializeStripe() {
  // Stripe Elements no longer needed for direct checkout
  // Note: Live mode requires HTTPS - see https://docs.stripe.com/js
  log('Stripe initialized for session redirect (no Elements needed)');
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

  // Always render plans if no active sub; otherwise show message
  if (hasActiveSubscription()) {
    safeHide(getElement('plansSection'));
    return;
  }

  plansContainer.innerHTML = '';

  // Plan duration mapping with display names
  const planDurations = {
    '1-month': { months: 1, displayName: '1 Month' },
    '3-month': { months: 3, displayName: '3 Months' },
    '6-month': { months: 6, displayName: '6 Months' },
    '12-month': { months: 12, displayName: '12 Months' }
  };

  availablePlans.forEach(plan => {
    const isCurrent = hasActiveSubscription(plan.id);
    const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
    const durationInfo = planDurations[planId] || { months: 1, displayName: '1 Month' };
    
    // plan.amount is total amount (in cents) for the entire subscription period
    const actualTotalCents = plan.amount || 0;
    const actualTotal = actualTotalCents / 100;
    
    // Effective monthly price = total / durationInfo.months
    const effectiveMonthly = actualTotal / durationInfo.months;
    
    // Format prices for display
    const monthlyPrice = formatCurrency(effectiveMonthly);
    const totalPrice = formatCurrency(actualTotal);
    
    const card = document.createElement('div');
    card.className = `col-lg-3 col-md-6 col-12`;
    card.innerHTML = `
      <div class="card h-100 plan-card ${isCurrent ? 'disabled-plan' : ''}">
        <div class="card-body d-flex flex-column justify-content-between h-100">
          <div>
            <div class="plan-duration mb-3">
              <span class="duration-badge">${durationInfo.displayName}</span>
            </div>
            <div class="plan-price mb-2">
              <div class="price-main">${monthlyPrice}</div>
              <div class="price-period">/month</div>
            </div>
            ${durationInfo.months > 1 ? `<div class="plan-total text-muted small">Total: ${totalPrice}</div>` : ''}
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
   Subscriptions
-------------------------------------------------- */

function hasActiveSubscription(planId = null) {
  return userSubscriptions.some(sub => {
    const daysLeft = sub.daysLeft !== undefined ? sub.daysLeft : 0;
    return (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'paused' || sub.status === 'incomplete' || sub.status === 'trialing') 
           && daysLeft > 0 
           && (!planId || sub.plan === planId);
  });
}

async function loadUserSubscriptions() {
  if (isLoadingSubscriptions) {
    log('loadUserSubscriptions - already loading, skipping');
    return;
  }

  isLoadingSubscriptions = true;

  const userToken = localStorage.getItem('token');
  log('loadUserSubscriptions - token:', userToken ? 'present' : 'missing');

  if (!userToken) {
    log('No user token found, showing plans');
    // Show plans section
    safeShow(getElement('plansSection'));
    safeHide(activeSubscriptionSection);
    isLoadingSubscriptions = false;
    return;
  }

  try {
    log('Fetching subscription data...');
    const data = await SubscriptionService.getCurrentSubscription(userToken);
    log('Subscription data:', data);

    // Store subscription if it exists (active, expired, or canceled)
    userSubscriptions = data?.data?._id
      ? [data.data]
      : [];

    log('userSubscriptions after load:', userSubscriptions);
    log('hasActiveSubscription:', hasActiveSubscription());

    if (userSubscriptions.length > 0) {
      // Hide plans, show active sub summary
      safeHide(getElement('plansSection'));
      safeShow(activeSubscriptionSection);
      renderActiveSubscriptionSummary();
    } else {
      // Show plans, hide active sub
      safeShow(getElement('plansSection'));
      safeHide(activeSubscriptionSection);
    }


  } catch (err) {
    console.error('Load subscriptions failed:', err);
    log('Error loading subscriptions:', err.message);
    // Default to showing plans
    safeShow(getElement('plansSection'));
    safeHide(activeSubscriptionSection);
  } finally {
    isLoadingSubscriptions = false;
  }
}

function toggleSubscriptionTabs(activeTab = 'summary') {
  // Safe hide all tab contents
  const summaryTab = getElement('subscriptionSummaryTab');
  const detailsTab = getElement('subscriptionDetailsTab');
  const invoicesTab = getElement('invoicesTab');
  
  if (summaryTab) summaryTab.classList.toggle('d-none', activeTab !== 'summary');
  if (detailsTab) detailsTab.classList.toggle('d-none', activeTab !== 'details');
  if (invoicesTab) invoicesTab.classList.toggle('d-none', activeTab !== 'invoices');
  
  // Update tab buttons safely
  document.querySelectorAll('[data-tab]').forEach(btn => {
    if (btn.dataset.tab === activeTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Default: show summary if no sub
  if (!userSubscriptions.length) {
    if (plansContainer) plansContainer.classList.remove('d-none');
    safeHide(userSubscriptionsSection);
  } else {
    if (plansContainer) plansContainer.classList.add('d-none');
    safeShow(userSubscriptionsSection);
  }
}

// Global parseDate helper - moved up for use in loadUserSubscriptions()
function parseDate(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof value === 'number') {
    const timestamp = value > 10000000000 ? value : value * 1000;
    return new Date(timestamp);
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  return fallback;
}

function renderActiveSubscriptionSummary() {
  if (!activeSubscriptionSummary) return;

  const sub = userSubscriptions[0];
  if (!sub) return;

  const planName = (sub.plan || 'Subscription').replace('-', ' ').toUpperCase();
  const amount = formatCurrency(sub.amount || 0);

  // Use backend-computed daysLeft (primary), fallback to local calc
  const computedDaysLeft = Math.ceil((parseDate(sub.currentPeriodEnd, new Date(Date.now() + 30 * 86400000)) - new Date()) / 86400000);
  const daysLeft = sub.daysLeft !== undefined ? sub.daysLeft : computedDaysLeft;
  const isExpired = daysLeft <= 0;
  const isPastDueOrPaused = sub.status === 'past_due' || sub.status === 'paused';
  const statusClass = isExpired ? 'expired' : (isPastDueOrPaused ? 'warning' : 'active');
  const statusText = isExpired ? 'EXPIRED' : (isPastDueOrPaused ? sub.status.toUpperCase() : 'ACTIVE');

  activeSubscriptionSummary.innerHTML = `
    <div class="row g-4 align-items-center">
      <div class="col-lg-8">
        <div class="subscription-summary-card">
          <div class="subscription-header">
            <h3 class="subscription-title">${planName}</h3>
            <span class="status-badge status-${statusClass.toLowerCase()}">${statusText}</span>
          </div>
          
          <div class="subscription-details">
            <div class="detail-item">
              <span class="detail-label">Monthly Cost</span>
              <span class="detail-value">${amount}</span>
            </div>
          <div class="detail-item">
              <span class="detail-label">Next Billing Date</span>
              <span class="detail-value">${parseDate(sub.currentPeriodEnd, new Date(Date.now() + 30 * 86400000)).toLocaleDateString()}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Days Remaining</span>
              <span class="detail-value">${isExpired ? 'Expired' : daysLeft + ' days'}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="actions-card">
          <h5 class="mb-3 fw-bold">Manage Your Plan</h5>
          <button id="manageSubscriptionBtn" class="btn btn-primary w-100 mb-2" title="Refresh subscription status">
            <i class="bi bi-arrow-clockwise me-2"></i>Refresh Status & Update Plan
          </button>
          <button data-action="download-invoices" data-sub-id="${sub.stripeSubscriptionId}" class="btn btn-outline-primary w-100 mb-2 btn-sm">
            <i class="bi bi-download me-2"></i>Download Invoices
          </button>
          <button data-action="cancel-plan" data-sub-id="${sub._id}" class="btn btn-outline-danger w-100 btn-sm">
            <i class="bi bi-trash me-2"></i>Cancel Plan
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderUserSubscriptions() {
  if (!userSubscriptionsContainer) return;

  userSubscriptionsContainer.innerHTML = '';

  userSubscriptions.forEach(sub => {
    const planName = (sub.plan || '').replace('-', ' ').toUpperCase();

    const start = parseDate(sub.currentPeriodStart, new Date());
    const end = parseDate(sub.currentPeriodEnd, new Date(start.getTime() + 30 * 86400000));

    const daysLeft = Math.ceil((end - new Date()) / 86400000);
    const expired = daysLeft <= 0;

    const card = document.createElement('div');
    card.className = 'subscription-card';
    card.innerHTML = `
      <h5>${planName} Plan</h5>
      <span class="subscription-status ${expired ? 'expired' : 'active'}">
        ${expired ? 'EXPIRED' : 'ACTIVE'}
      </span>
      <div>Amount: ${formatCurrency(sub.amount)}/month</div>
      <div>Next Billing: ${end.toLocaleDateString()}</div>
      <div>Days Left: ${expired ? 'Expired' : daysLeft}</div>
      <div class="subscription-actions">
        <button onclick="downloadInvoices('${sub.stripeSubscriptionId}')">Invoices</button>
        ${expired 
          ? `<button class="primary" onclick="renewSubscription()">Renew Subscription</button>` 
          : `<button class="danger" onclick="openCancelModal('${sub.stripeSubscriptionId}')">Cancel</button>`
        }
      </div>
    `;

    userSubscriptionsContainer.appendChild(card);
  });
}

/* --------------------------------------------------
   Plan Selection & Payment
-------------------------------------------------- */

async function selectPlan(planId) {
  selectedPlanId = planId;

  const userToken = localStorage.getItem('token');
  if (!userToken) {
    showAlert('Please log in to subscribe', 'info');
    setTimeout(() => {
      window.location.href = `/login?redirect=/subscriptions`;
    }, 1500);
    return;
  }

  await loadUserSubscriptions();

  if (hasActiveSubscription(planId)) {
    showAlert('You already have this plan', 'warning');
    return;
  }

  // Direct redirect to checkout - no modal
  showAlert('Redirecting to secure checkout...', 'info');
  try {
    const data = await SubscriptionService.createCheckout(userToken, planId);
    if (data?.data?.url) {
      setTimeout(() => {
        window.location.href = data.data.url;
      }, 800);
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

function renewSubscription() {
  // Allow user to select a new plan and redirect to payment
  showAlert('Redirecting you to select a new plan...', 'info');
  
  // Clear the current subscription from view and show plans
  userSubscriptions = [];
  renderPlans();
  toggleViews();
  
  // Scroll to plans section
  const plansSection = document.querySelector('.plans-container-wrapper');
  if (plansSection) {
    plansSection.scrollIntoView({ behavior: 'smooth' });
  }
}

async function downloadInvoices(subscriptionId) {
  const userToken = localStorage.getItem('token');
  
  if (!userToken) {
    showAlert('Please log in to download invoices', 'error');
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${subscriptionId}/invoices`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    const data = await handleApiResponse(res);
    
    if (!data.data || data.data.length === 0) {
      showAlert('No invoices found for this subscription', 'info');
      return;
    }

    // Open a modal or alert showing invoices
    let invoiceHtml = '<div style="max-height: 400px; overflow-y: auto;">';
    invoiceHtml += '<h5 class="mb-3">Recent Invoices</h5>';
    
    data.data.forEach(invoice => {
      const pdfUrl = invoice.invoice_pdf || invoice.hosted_invoice_url;
      const date = new Date(invoice.created * 1000).toLocaleDateString();
      const amount = formatCurrency(invoice.amount_paid / 100 || invoice.total / 100);
      const status = invoice.status === 'paid' ? '✓ Paid' : 'Pending';
      
      if (pdfUrl) {
        invoiceHtml += `
          <div class="mb-2 p-2 border-bottom">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>Invoice #${invoice.number || invoice.id.slice(-8)}</strong>
                <div class="small text-muted">${date} - ${amount} - ${status}</div>
              </div>
              <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary">
                Download
              </a>
            </div>
          </div>
        `;
      }
    });
    
    invoiceHtml += '</div>';
    
    // Create a simple alert with invoices
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-info alert-dismissible fade show';
    alertDiv.innerHTML = `
      ${invoiceHtml}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
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

  const userToken = localStorage.getItem('token');
  if (!userToken) {
    showAlert('Please log in to continue', 'error');
    return;
  }

  const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

  try {
    await SubscriptionService.cancelSubscription(userToken, currentSubscriptionId);

    showAlert(
      atPeriodEnd
        ? 'Subscription will end at period end'
        : 'Subscription canceled',
      'success'
    );

    bootstrap.Modal.getInstance(
      document.getElementById('cancelConfirmModal')
    ).hide();

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
  const urlParams = new URLSearchParams(window.location.search);
  const success = urlParams.get('success');
  const sessionId = urlParams.get('session_id');
  const canceled = urlParams.get('canceled');

  if (canceled === 'true') {
    showAlert('Subscription purchase canceled.', 'warning');
    return;
  }

  if (success === 'true' && sessionId && localStorage.getItem('token')) {
    try {
      log('Verifying checkout session:', sessionId);
      showAlert('Verifying subscription purchase...', 'info');
      const data = await SubscriptionService.verifySession(localStorage.getItem('token'), sessionId);
      
      if (data.success && data.data) {
        showAlert(`Subscription activated successfully! ${data.data.plan.replace('-', ' ')} plan.`, 'success');
        userSubscriptions = [data.data];
        safeHide(getElement('plansSection'));
        safeShow(activeSubscriptionSection);
  renderActiveSubscriptionSummary();
  
  // Add event listeners for dynamic buttons (CSP safe)
  setTimeout(() => {
    document.querySelector('[data-action="download-invoices"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      downloadInvoices(e.currentTarget.dataset.subId);
    });
    document.querySelector('[data-action="cancel-plan"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      openCancelModal(e.currentTarget.dataset.subId);
    });
  }, 100);
  
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
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

  // Get fresh token
  const userToken = localStorage.getItem('token');
  log('Initial token check:', userToken ? 'present' : 'missing');

  initializeStripe();
  document
    .getElementById('confirmCancelBtn')
    ?.addEventListener('click', handleConfirmCancel);

  // Global event delegation for all dynamic subscription buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]') || (e.target.id === 'manageSubscriptionBtn' ? e.target : e.target.closest('#manageSubscriptionBtn'));

    if (!btn) return;

    if (btn.id === 'manageSubscriptionBtn') {
      e.preventDefault();
      showAlert('Refreshing subscription status...', 'info');
      await loadUserSubscriptions();
      return;
    }

    const action = btn.dataset.action;
    const subId = btn.dataset.subId;

    if (action === 'download-invoices') {
      e.preventDefault();
      await downloadInvoices(subId);
    } else if (action === 'cancel-plan') {
      e.preventDefault();
      openCancelModal(subId);
    }
  });

  await loadPlans();
  if (userToken) {
    await handleSuccessRedirect();
    await loadUserSubscriptions();
  }
});
