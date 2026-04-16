/**
 * view-subscription.js
 * Handles the view-subscription page functionality
 * Displays subscription details, invoices, and cancel option
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

let currentSubscription = null;
let currentSubscriptionId = null;

const DEBUG = true;

/* --------------------------------------------------
   DOM Elements
-------------------------------------------------- */

const alertContainer = document.getElementById('alertContainer');
const loadingState = document.getElementById('loadingState');
const noSubscriptionState = document.getElementById('noSubscriptionState');
const subscriptionDetails = document.getElementById('subscriptionDetails');
const invoicesLoading = document.getElementById('invoicesLoading');
const invoicesList = document.getElementById('invoicesList');
const noInvoices = document.getElementById('noInvoices');

/* --------------------------------------------------
   Utilities
-------------------------------------------------- */

function log(...args) {
  if (DEBUG) console.log(...args);
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

function formatCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0.00';
  }
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(date) {
  if (!date) return '-';
  // Handle both Date objects and ISO strings from JSON
  let dateObj;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '-';
  }
  if (isNaN(dateObj.getTime())) return '-';
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Safely format timestamp/Date/string to Date object for invoice display.
 * Backend sends ms timestamps. Prevents double-multiplication bug.
 */
function safeFormatDate(value) {
  if (!value || value === 0) return new Date();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof value === 'number') {
    // Backend sends ms, Stripe raw is seconds (but backend converts)
    // Use Number() coercion - safe for valid timestamps
    const ts = Number(value);
    return !isNaN(ts) ? new Date(ts) : new Date();
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  return new Date();
}

function formatInvoiceDate(date) {
  if (!date) return '-';
  const dateObj = safeFormatDate(date);
  if (isNaN(dateObj.getTime())) return '-';
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}


/* --------------------------------------------------
   API Functions
-------------------------------------------------- */

async function handleApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Non-JSON response:', text.slice(0, 500));
    throw new Error(`Server returned non-JSON (${response.status})`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  return data;
}

/* --------------------------------------------------
   Payment Method Details
-------------------------------------------------- */

async function fetchPaymentMethodDetails(subscriptionId) {
  try {
    log('Fetching payment method details...');
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${subscriptionId}/payment-method`,
      { credentials: 'include' }
    );

    const data = await handleApiResponse(res);
    log('Payment method data:', data);

    if (data.success && data.data && data.data.card) {
      setupPaymentMethodHover(data.data.card);
    }
  } catch (err) {
    console.error('Failed to fetch payment method details:', err);
    log('Error fetching payment method:', err.message);
  }
}

function setupPaymentMethodHover(cardData) {
  const paymentMethodEl = document.getElementById('paymentMethod');
  if (!paymentMethodEl) return;

  let originalText = paymentMethodEl.textContent;
  let hoverTimeout;

  // Format card brand and last 4 digits
  const brandName = cardData.brand.charAt(0).toUpperCase() + cardData.brand.slice(1);
  const lastFour = cardData.last4;
  const expiry = `${String(cardData.exp_month).padStart(2, '0')}/${cardData.exp_year}`;

  const hoverText = `${brandName} ending in ${lastFour} (expires ${expiry})`;

  paymentMethodEl.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      paymentMethodEl.textContent = hoverText;
      paymentMethodEl.style.cursor = 'default';
    }, 300); // Small delay to prevent flickering
  });

  paymentMethodEl.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      paymentMethodEl.textContent = originalText;
    }, 300);
  });
}

/* --------------------------------------------------
   Load Subscription Data
-------------------------------------------------- */

async function loadSubscription() {
  try {
    log('Fetching subscription data...');
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/user/current`,
      { credentials: 'include' }
    );

    log('Response status:', res.status);
    const data = await handleApiResponse(res);
    log('Subscription data:', data);

    if (!data?.data?.hasActiveSubscription) {
      log('No active subscription found');
      showNoSubscriptionState();
      return;
    }

    currentSubscription = data.data;
    currentSubscriptionId = data.data.stripeSubscriptionId;
    log('Subscription loaded:', currentSubscription);
    
    // Fetch invoices as well
    await Promise.all([
      renderSubscriptionDetails(),
      loadInvoices()
    ]);

    showSubscriptionDetails();
  } catch (err) {
    console.error('Load subscription failed:', err);
    log('Error loading subscription:', err.message);
    showAlert('Failed to load subscription details', 'error');
  } finally {
    if (loadingState) loadingState.style.display = 'none';
  }
}

function showNoSubscriptionState() {
  if (loadingState) loadingState.style.display = 'none';
  if (noSubscriptionState) noSubscriptionState.style.display = 'block';
  if (subscriptionDetails) subscriptionDetails.style.display = 'none';
}

function showSubscriptionDetails() {
  if (loadingState) loadingState.style.display = 'none';
  if (noSubscriptionState) noSubscriptionState.style.display = 'none';
  if (subscriptionDetails) subscriptionDetails.style.display = 'block';
}

function renderSubscriptionDetails() {
  if (!currentSubscription) return;

  const sub = currentSubscription;

  // Subscription Type
  const planName = (sub.plan || '').replace('-', ' ').toUpperCase();
  document.getElementById('subscriptionType').textContent = `${planName} Plan`;

  // Status Badge
  const statusEl = document.getElementById('subscriptionStatus');
  const isExpired = sub.daysLeft <= 0;
  const isCanceled = sub.status === 'cancelled';
  
  if (isExpired) {
    statusEl.className = 'badge bg-danger';
    statusEl.textContent = 'EXPIRED';
  } else if (isCanceled) {
    statusEl.className = 'badge bg-warning text-dark';
    statusEl.textContent = 'CANCELED';
  } else if (sub.cancelAtPeriodEnd) {
    statusEl.className = 'badge bg-warning text-dark';
    statusEl.textContent = 'CANCELING';
  } else {
    statusEl.className = 'badge bg-success';
    statusEl.textContent = 'ACTIVE';
  }

  // Amount
  document.getElementById('subscriptionAmount').textContent = formatCurrency(sub.amount);
  document.getElementById('billingPeriod').textContent = 'per month';

  // Calculate dates and days
  const now = new Date();
  
  // Helper function to parse date values (handles strings from JSON, Date objects, and timestamps)
  /**
   * Parse subscription dates (periodStart/End from DB).
   * Uses safeFormatDate internally for consistency.
   */
  function parseDate(value, fallback) {
    const parsed = safeFormatDate(value);
    return parsed && !isNaN(parsed.getTime()) ? parsed : fallback;
  }
  
  // Calculate fallback period end based on plan duration
  function calculateFallbackPeriodEnd(plan) {
    const fallbackDays = {
      '1-month': 30,
      '3-month': 90,
      '6-month': 180,
      '12-month': 365
    };
    return fallbackDays[plan] || 30; // Default to 30 days
  }

  const fallbackDays = calculateFallbackPeriodEnd(sub.plan);
  const periodEnd = parseDate(sub.currentPeriodEnd, new Date(now.getTime() + fallbackDays * 86400000));
  const periodStart = parseDate(sub.currentPeriodStart, new Date(now.getTime() - fallbackDays * 86400000));
  
  // Calculate days remaining
  let daysLeft;
  if (sub.daysLeft !== undefined) {
    daysLeft = sub.daysLeft;
  } else {
    daysLeft = Math.ceil((periodEnd - now) / 86400000);
  }

  // Next billing date (for active subscriptions)
  document.getElementById('nextBillingDate').textContent = formatDate(periodEnd);
  
  // Days remaining
  const daysRemainingEl = document.getElementById('daysRemaining');
  if (daysLeft > 0) {
    daysRemainingEl.textContent = `${daysLeft} days`;
  } else if (daysLeft === 0) {
    daysRemainingEl.textContent = 'Renews Today';
    daysRemainingEl.classList.add('text-warning', 'fw-bold');
  } else {
    daysRemainingEl.textContent = 'Expired';
    daysRemainingEl.classList.add('text-danger');
  }

  // Payment method - fetch actual details
  const paymentMethodEl = document.getElementById('paymentMethod');
  paymentMethodEl.textContent = 'Card ending in ••••';

  // Fetch payment method details
  if (currentSubscriptionId) {
    fetchPaymentMethodDetails(currentSubscriptionId);
  }

  // Progress bar - calculate based on exact time elapsed, not rounded days
  const totalTime = periodEnd - periodStart;
  const elapsedTime = now - periodStart;
  const progressPercent = Math.min(100, Math.max(0, (elapsedTime / totalTime) * 100));
  
  const progressBar = document.getElementById('subscriptionProgress');
  progressBar.style.width = `${progressPercent}%`;
  
  if (daysLeft <= 0) {
    progressBar.classList.remove('bg-primary');
    progressBar.classList.add('bg-danger');
  } else if (progressPercent > 80) {
    progressBar.classList.remove('bg-primary');
    progressBar.classList.add('bg-warning');
  }
  
  document.getElementById('progressPercent').textContent = `${Math.round(progressPercent)}%`;

  // Cancel button visibility
  const cancelBtn = document.getElementById('cancelBtn');
  if (isExpired || isCanceled) {
    cancelBtn.style.display = 'none';
  } else {
    cancelBtn.style.display = 'inline-flex';
  }

  // Update period end date in modal
  document.getElementById('periodEndDate').textContent = formatDate(periodEnd);
}

/* --------------------------------------------------
   Invoices
-------------------------------------------------- */

async function loadInvoices() {
  if (!currentSubscriptionId) {
    showNoInvoicesState();
    return;
  }

  try {
    log('Fetching invoices...');
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/invoices`,
      { credentials: 'include' }
    );

    log('Invoices response status:', res.status);
    const data = await handleApiResponse(res);
    log('Invoices data:', data);
    renderInvoices(data.data || []);
  } catch (err) {
    console.error('Load invoices failed:', err);
    log('Error loading invoices:', err.message);
    showNoInvoicesState();
  } finally {
    if (invoicesLoading) invoicesLoading.style.display = 'none';
  }
}

function renderInvoices(invoices) {
  if (!invoicesList) return;

  if (invoices.length === 0) {
    showNoInvoicesState();
    return;
  }

  invoicesList.innerHTML = '';
  invoicesList.style.display = 'block';

  invoices.forEach(invoice => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center py-3';
    
    const isPaid = invoice.status === 'paid';
    const statusClass = isPaid ? 'bg-success' : 'bg-warning';
    const statusText = isPaid ? 'Paid' : (invoice.status || 'Pending');
    
    item.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="me-3">
          <i class="bi bi-file-earmark-pdf text-danger" style="font-size: 1.5rem;"></i>
        </div>
        <div>
          <div class="fw-medium">Invoice #${invoice.number || invoice.id.slice(-8)}</div>
          <small class="text-muted">${formatInvoiceDate(invoice.created || invoice.date)}</small>
        </div>
      </div>
      <div class="d-flex align-items-center">
        <div class="me-3 text-end">
          <div class="fw-medium">${formatCurrency(invoice.amount_paid / 100 || invoice.total / 100)}</div>
          <span class="badge ${statusClass}">${statusText}</span>
        </div>
        ${invoice.invoice_pdf || invoice.hosted_invoice_url ? `
          <a href="${invoice.invoice_pdf || invoice.hosted_invoice_url}" 
             class="btn btn-sm btn-outline-primary" 
             target="_blank" 
             rel="noopener noreferrer"
             onclick="event.stopPropagation();">
            <i class="bi bi-download me-1"></i>Download
          </a>
        ` : ''}
      </div>
    `;

    invoicesList.appendChild(item);
  });
}

function showNoInvoicesState() {
  if (invoicesLoading) invoicesLoading.style.display = 'none';
  if (noInvoices) noInvoices.style.display = 'block';
}

/* --------------------------------------------------
   Cancel Subscription
-------------------------------------------------- */

function openCancelModal() {
  if (!currentSubscriptionId) {
    showAlert('Subscription not found', 'error');
    return;
  }

  const modal = new bootstrap.Modal(document.getElementById('cancelConfirmModal'));
  modal.show();
}

async function handleConfirmCancel() {
  if (!currentSubscriptionId) {
    showAlert('Subscription not found', 'error');
    return;
  }

  const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/cancel`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ atPeriodEnd })
      }
    );

    await handleApiResponse(res);

    showAlert(
      atPeriodEnd
        ? 'Subscription will end at the current period end date'
        : 'Subscription cancelled successfully',
      'success'
    );

    bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
    document.getElementById('atPeriodEndCheck').checked = false;

    // Reload subscription details
    await loadSubscription();
  } catch (err) {
    console.error('Cancel failed:', err);
    showAlert(err.message, 'error');
  }
}

// Make functions globally accessible
window.openCancelModal = openCancelModal;
window.handleConfirmCancel = handleConfirmCancel;

/* --------------------------------------------------
   Init
-------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  log('View-Subscription page loaded');

  // Set up cancel button
  document.getElementById('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);

  // Load subscription
  await loadSubscription();
});

