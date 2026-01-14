/**
 * subscriptions.js
 * Handles subscription plans, Stripe payments, and user subscriptions
 */

/* --------------------------------------------------
   Config & Globals
-------------------------------------------------- */

window.API_BASE = window.ApiConfig.getAPI_BASE();

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
      }
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

  plansContainer.innerHTML = '';

  // If user has active subscription, show message and hide plans
  if (hasActiveSubscription()) {
    plansContainer.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="mb-4">
          <i class="bi bi-check-circle-fill text-success" style="font-size: 4rem;"></i>
        </div>
        <h3 class="mb-3">You Have an Active Subscription</h3>
        <p class="text-muted mb-4">You cannot choose a different plan while you have an active subscription.</p>
        <a href="view-subscription.html" class="btn btn-primary btn-lg">
          <i class="bi bi-credit-card me-2"></i>View My Subscription
        </a>
      </div>
    `;
    return;
  }

  // Border class for each plan
  const planBorders = {
    '1-month': 'border-primary',
    '3-month': 'border-success',
    '6-month': 'border-info',
    '12-month': 'border-warning'
  };

  // Base benefits for all plans
  const baseBenefits = [
    'Basic workout access',
    'Cancel anytime',
    'No commitment'
  ];

  // Additional benefits based on plan duration
  const additionalBenefits = {
    '1-month': [],
    '3-month': ['Personalized plans', 'Priority support'],
    '6-month': ['Trainer consultations', 'Custom meal planning'],
    '12-month': ['Unlimited consultations', 'Premium analytics']
  };

  // Monthly baseline price in cents
  const MONTHLY_BASELINE_CENTS = 18000;

  availablePlans.forEach(plan => {
    const isCurrent = hasActiveSubscription(plan.id);
    const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
    const borderClass = planBorders[planId] || 'border-primary';
    
    // Derive intervalCount from plan ID
    let intervalCount;
    switch (planId) {
      case '1-month': intervalCount = 1; break;
      case '3-month': intervalCount = 3; break;
      case '6-month': intervalCount = 6; break;
      case '12-month': intervalCount = 12; break;
      default: intervalCount = 1;
    }
    
    // plan.amount is total amount (in cents) for the entire subscription period
    const actualTotalCents = plan.amount || 0;
    const actualTotal = actualTotalCents / 100;
    
    // Effective monthly price = total / intervalCount
    const effectiveMonthly = actualTotal / intervalCount;
    
    // Baseline total = monthly baseline × intervalCount
    const baselineTotal = (MONTHLY_BASELINE_CENTS / 100) * intervalCount;
    
    // Savings = baseline - actual
    const savingsCents = baselineTotal * 100 - actualTotalCents;
    const savingsAmount = savingsCents / 100;
    
    // Savings percentage
    const savingsPercent = Math.round((savingsCents / (baselineTotal * 100)) * 100);
    
    // Format price for display (effective monthly)
    const price = formatCurrency(effectiveMonthly);
    const totalAmount = actualTotal;
    
    // Build billing text
    let billingText;
    if (intervalCount === 1) {
      billingText = `${price} billed monthly`;
    } else {
      billingText = `${price}/month (${formatCurrency(totalAmount)} total for ${intervalCount} months)`;
    }
    
    // Build benefits list dynamically
    const benefits = [billingText, ...baseBenefits, ...(additionalBenefits[planId] || [])];
    if (savingsAmount > 0) {
      benefits.splice(1, 0, `Save ${formatCurrency(savingsAmount)}`);
    }

    // Build benefits list HTML
    const benefitsHtml = benefits.map(benefit =>
      `<li><i class="bi bi-check-circle-fill text-success"></i>${benefit}</li>`
    ).join('');

    const card = document.createElement('div');
    card.className = `plan-card ${borderClass} ${isCurrent ? 'disabled-plan' : ''}`;
    card.innerHTML = `
      <div class="card-header text-center">
        <h3 class="card-title mb-0">${plan.name || 'Plan'}</h3>
        ${savingsAmount > 0 ? `<div class="plan-savings badge bg-warning text-dark mt-2">Save ${savingsPercent}%</div>` : ''}
      </div>
      <div class="card-body text-center">
        <div class="plan-price">
          <span class="price-amount">
            <span class="currency">$</span>${price}
          </span>
          <span class="period">/month</span>
        </div>
        <ul class="list-unstyled mb-4">
          ${benefitsHtml}
        </ul>
        <button class="btn plan-button ${isCurrent ? '' : borderClass}" ${isCurrent ? 'disabled' : ''}>
          ${isCurrent ? 'Current Plan' : 'Select Plan'}
        </button>
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

    userSubscriptions = data?.data?.hasActiveSubscription
      ? [data.data]
      : [];

    log('userSubscriptions after load:', userSubscriptions);
    log('hasActiveSubscription:', hasActiveSubscription());

    // User should not be able to choose a different plan - only cancel
    // If user has active subscription, redirect to view-subscription page
    if (hasActiveSubscription()) {
      log('User has active subscription - redirecting to view-subscription.html...');
      showAlert('You already have an active subscription. You can view or cancel it from the My Subscription page.', 'info');
      setTimeout(() => {
        window.location.href = 'view-subscription.html';
      }, 2000);
      return;
    }

    renderUserSubscriptions();
    toggleViews();
  } catch (err) {
    console.error('Load subscriptions failed:', err);
    log('Error loading subscriptions:', err.message);
  }
}

function toggleViews() {
  const hasSub = hasActiveSubscription();
  userSubscriptionsSection.style.display = hasSub ? 'block' : 'none';
  plansContainer.style.display = hasSub ? 'none' : 'grid';
}

function renderUserSubscriptions() {
  if (!userSubscriptionsContainer) return;

  userSubscriptionsContainer.innerHTML = '';

  userSubscriptions.forEach(sub => {
    const planName = (sub.plan || '').replace('-', ' ').toUpperCase();

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
        ${!expired ? `<button onclick="downloadInvoices('${sub.stripeSubscriptionId}')">Invoices</button>` : ''}
        ${!expired ? `<button class="danger" onclick="openCancelModal('${sub.stripeSubscriptionId}')">Cancel</button>` : ''}
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

  if (!userToken) {
    showAlert('Please log in to subscribe', 'info');
    setTimeout(() => {
      window.location.href = `/pages/login.html?redirect=/subscriptions.html`;
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

  const email = document.getElementById('paymentEmail').value.trim();
  const name = document.getElementById('cardholderName').value.trim();

  if (!email || !name) {
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
      billing_details: { name, email }
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
        email,
        paymentMethodId: paymentMethod.id
      })
    });

    await handleApiResponse(res);

    showAlert('Subscription successful!', 'success');
    bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
    paymentForm.reset();
    cardElement.clear();

    await loadUserSubscriptions();
    window.location.href = 'dashboard.html';
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
   Cancel Subscription
-------------------------------------------------- */

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

  await loadPlans();
  if (userToken) await loadUserSubscriptions();
});
