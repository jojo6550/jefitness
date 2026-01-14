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

function formatInvoiceDate(date) {
  if (!date) return '-';
  // Handle both Date objects and timestamps (Stripe returns seconds, server may convert to Date)
  let dateObj;
  if (typeof date === 'number') {
    // If it's a large number (seconds), convert to milliseconds
    dateObj = date > 10000000000 ? new Date(date) : new Date(date * 1000);
  } else {
    dateObj = typeof date === 'string' ? new Date(date) : date;
  }
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
   Load Subscription Data
-------------------------------------------------- */

async function loadSubscription() {
  const userToken = localStorage.getItem('token');
  log('loadSubscription - token:', userToken ? 'present' : 'missing');

  if (!userToken) {
    showNoSubscriptionState();
    return;
  }

  try {
    log('Fetching subscription data...');
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/user/current`,
      { headers: { Authorization: `Bearer ${userToken}` } }
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
      loadInvoices(userToken)
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
  const isCanceled = sub.status === 'canceled';
  
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
  function parseDate(value, fallback) {
    if (!value) return fallback;
    // If it's a string (ISO format from JSON), try to parse it
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? fallback : d;
    }
    // If it's a number (timestamp in seconds), convert to Date
    if (typeof value === 'number') {
      const timestamp = value > 10000000000 ? value : value * 1000;
      return new Date(timestamp);
    }
    // If it's already a Date object
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value;
    }
    return fallback;
  }
  
  const periodEnd = parseDate(sub.currentPeriodEnd, new Date(now.getTime() + 30 * 86400000));
  const periodStart = parseDate(sub.currentPeriodStart, new Date(now.getTime() - 30 * 86400000));
  
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
  if (daysLeft <= 0) {
    daysRemainingEl.textContent = 'Expired';
    daysRemainingEl.classList.add('text-danger');
  } else {
    daysRemainingEl.textContent = `${daysLeft} days`;
  }

  // Payment method (placeholder - would need to fetch from Stripe)
  document.getElementById('paymentMethod').textContent = 'Card ending in ••••';

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

async function loadInvoices(userToken) {
  if (!currentSubscriptionId) {
    showNoInvoicesState();
    return;
  }

  try {
    log('Fetching invoices...');
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/invoices`,
      { headers: { Authorization: `Bearer ${userToken}` } }
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
  const userToken = localStorage.getItem('token');
  
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
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ atPeriodEnd })
      }
    );

    await handleApiResponse(res);

    showAlert(
      atPeriodEnd
        ? 'Subscription will end at the current period end date'
        : 'Subscription canceled successfully',
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

  // Check authentication
  userToken = localStorage.getItem('token');
  if (!userToken) {
    showAlert('Please log in to view your subscription', 'info');
    setTimeout(() => {
      window.location.href = `/pages/login.html?redirect=/view-subscription.html`;
    }, 1500);
    return;
  }

  // Set up cancel button
  document.getElementById('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);

  // Load subscription
  await loadSubscription();
});

