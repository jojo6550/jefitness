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

/* --------------------------------------------------
   DOM Elements
-------------------------------------------------- */

const alertContainer = document.getElementById('alertContainer');
const plansContainer = document.getElementById('plansContainer');
const plansLoading = document.getElementById('plansLoading');

const paymentForm = document.getElementById('paymentForm');
const cardErrors = document.getElementById('cardErrors');

const userSubscriptionsSection = document.getElementById('userSubscriptionsSection');
const userSubscriptionsContainer = document.getElementById('userSubscriptionsContainer');
const activeSubscriptionSection = document.getElementById('activeSubscriptionSection');
const activeSubscriptionSummary = document.getElementById('activeSubscriptionSummary');
const manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');

/* --------------------------------------------------
   Utilities
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
  try {
    const elements = stripe.elements();

    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': { color: '#9ca3af' }
        },
        invalid: {
          color: '#fa755a',
          iconColor: '#fa755a'
        }
      },
      // Enable postal code collection within the card element
      hidePostalCode: false
    });

    const modal = document.getElementById('paymentModal');
    modal?.addEventListener('shown.bs.modal', () => {
      if (!document.querySelector('#cardElement .StripeElement')) {
        cardElement.mount('#cardElement');
      }
    });

    cardElement.on('change', e => {
      if (cardErrors) cardErrors.textContent = e.error?.message || '';
    });

    log('Stripe initialized');
  } catch (err) {
    console.error('Stripe init failed:', err);
    showAlert('Failed to load payment system', 'error');
  }
}

/* --------------------------------------------------
   Plans
-------------------------------------------------- */

async function loadPlans() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/subscriptions/plans`);
    const data = await handleApiResponse(res);

    availablePlans = data?.data?.plans || [];
    renderPlans();
  } catch (err) {
    console.error('Load plans failed:', err);
    showAlert('Failed to load subscription plans', 'error');
  } finally {
    if (plansLoading) plansLoading.style.display = 'none';
  }
}

function renderPlans() {
  if (!plansContainer) return;

  // Always render plans if no active sub; otherwise show message
  if (hasActiveSubscription()) {
    document.getElementById('plansSection').style.display = 'none';
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

  plansContainer.style.display = 'grid';
}

/* --------------------------------------------------
   Subscriptions
-------------------------------------------------- */

function hasActiveSubscription(planId = null) {
  return userSubscriptions.some(
    sub => (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'paused') && (!planId || sub.plan === planId)
  );
}

async function loadUserSubscriptions() {
  const userToken = localStorage.getItem('token');
  log('loadUserSubscriptions - token:', userToken ? 'present' : 'missing');

  if (!userToken) {
    log('No user token found, showing plans');
    // Show plans section
    document.getElementById('plansSection').style.display = 'block';
    activeSubscriptionSection.style.display = 'none';
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

    // Store subscription if it exists (active, expired, or canceled)
    userSubscriptions = data?.data?.stripeSubscriptionId
      ? [data.data]
      : [];

    log('userSubscriptions after load:', userSubscriptions);
    log('hasActiveSubscription:', hasActiveSubscription());

    if (userSubscriptions.length > 0) {
      // Hide plans, show active sub summary
      document.getElementById('plansSection').style.display = 'none';
      activeSubscriptionSection.style.display = 'block';
      renderActiveSubscriptionSummary();
    } else {
      // Show plans, hide active sub
      document.getElementById('plansSection').style.display = 'block';
      activeSubscriptionSection.style.display = 'none';
    }

    // Hide tabs section (moved to view-subscription.html)
    document.getElementById('subscriptionTabsSection').style.display = 'none';
  } catch (err) {
    console.error('Load subscriptions failed:', err);
    log('Error loading subscriptions:', err.message);
    // Default to showing plans
    document.getElementById('plansSection').style.display = 'block';
    activeSubscriptionSection.style.display = 'none';
  }
}

function toggleSubscriptionTabs(activeTab = 'summary') {
  // Hide all tab contents
  const summaryTab = document.getElementById('subscriptionSummaryTab');
  const detailsTab = document.getElementById('subscriptionDetailsTab');
  const invoicesTab = document.getElementById('invoicesTab');
  
  if (summaryTab) summaryTab.style.display = activeTab === 'summary' ? 'block' : 'none';
  if (detailsTab) detailsTab.style.display = activeTab === 'details' ? 'block' : 'none';
  if (invoicesTab) invoicesTab.style.display = activeTab === 'invoices' ? 'block' : 'none';
  
  // Update tab buttons
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  
  // Default: show summary if no sub
  if (!userSubscriptions.length) {
    plansContainer.style.display = 'grid';
    userSubscriptionsSection.style.display = 'none';
  } else {
    plansContainer.style.display = 'none';
    userSubscriptionsSection.style.display = 'block';
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

  const now = new Date();
  const periodEnd = parseDate(sub.currentPeriodEnd, new Date(now.getTime() + 30 * 86400000));
  const daysLeft = Math.ceil((periodEnd - now) / 86400000);

  const isExpired = daysLeft <= 0;
  const statusClass = isExpired ? 'expired' : 'active';
  const statusText = isExpired ? 'EXPIRED' : 'ACTIVE';

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
              <span class="detail-value">${periodEnd.toLocaleDateString()}</span>
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
          <button id="manageSubscriptionBtn" class="btn btn-primary w-100 mb-2">
            <i class="bi bi-pencil me-2"></i>Update Plan
          </button>
          <button onclick="downloadInvoices('${sub.stripeSubscriptionId}')" class="btn btn-outline-primary w-100 mb-2 btn-sm">
            <i class="bi bi-download me-2"></i>Download Invoices
          </button>
          <button onclick="openCancelModal('${sub.stripeSubscriptionId}')" class="btn btn-outline-danger w-100 btn-sm">
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

  new bootstrap.Modal(document.getElementById('paymentModal')).show();
}

async function handlePaymentSubmit(e) {
  e.preventDefault();

  if (!selectedPlanId || !cardElement) {
    showAlert('Payment not ready', 'error');
    return;
  }

  const userToken = localStorage.getItem('token');
  if (!userToken) {
    showAlert('Please log in to continue', 'error');
    return;
  }

  const name = document.getElementById('cardholderName').value.trim();

  if (!name) {
    showAlert('Please fill in all fields', 'error');
    return;
  }

  const btn = document.getElementById('submitPaymentBtn');
  const text = document.getElementById('submitPaymentText');
  const spinner = document.getElementById('submitPaymentSpinner');

  btn.disabled = true;
  text.style.display = 'none';
  spinner.style.display = 'inline';

  try {
    const { paymentMethod, error } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
      billing_details: {
        name
      }
    });

    if (error) throw new Error(error.message);

    const res = await fetch(`${API_BASE}/api/v1/subscriptions/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({
        plan: selectedPlanId,
        paymentMethodId: paymentMethod.id
      })
    });

    await handleApiResponse(res);

    showAlert('Subscription successful!', 'success');
    bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
    paymentForm.reset();
    cardElement.clear();

    await loadUserSubscriptions();
  } catch (err) {
    console.error('Payment failed:', err);
    showAlert(err.message, 'error');
  } finally {
    btn.disabled = false;
    text.style.display = 'inline';
    spinner.style.display = 'none';
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

document.addEventListener('DOMContentLoaded', async () => {
  log('Subscriptions page loaded');

  // Get fresh token
  const userToken = localStorage.getItem('token');
  log('Initial token check:', userToken ? 'present' : 'missing');

  initializeStripe();
  paymentForm?.addEventListener('submit', handlePaymentSubmit);
  document
    .getElementById('confirmCancelBtn')
    ?.addEventListener('click', handleConfirmCancel);

  // Add click handler for manage subscription button
  document.addEventListener('click', (e) => {
    if (e.target.id === 'manageSubscriptionBtn' || e.target.closest('#manageSubscriptionBtn')) {
      // Show plans section and scroll to it
      document.getElementById('plansSection').style.display = 'block';
      document.getElementById('activeSubscriptionSection').style.display = 'none';
      
      setTimeout(() => {
        document.querySelector('#plansSection').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  });

  await loadPlans();
  if (userToken) await loadUserSubscriptions();
});
