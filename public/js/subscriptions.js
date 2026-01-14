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
let userToken = localStorage.getItem('token');

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

  // Savings messages based on plan duration
  const savingsMessages = {
    '1-month': null,
    '3-month': 'Save $15 vs monthly',
    '6-month': 'Save $60 vs monthly',
    '12-month': 'Save $180 vs monthly'
  };

  availablePlans.forEach(plan => {
    const isCurrent = hasActiveSubscription(plan.id);
    const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
    const borderClass = planBorders[planId] || 'border-primary';
    
    // Calculate price from API data (amount is in cents)
    const monthlyAmount = plan.amount ? plan.amount / 100 : 0;
    const price = plan.displayPrice || (monthlyAmount ? `$${monthlyAmount.toFixed(2)}` : 'N/A');
    
    // Calculate total based on plan duration
    let duration, totalAmount, billingText;
    switch (planId) {
      case '1-month':
        duration = 1;
        totalAmount = monthlyAmount;
        billingText = `${price} billed monthly`;
        break;
      case '3-month':
        duration = 3;
        totalAmount = monthlyAmount * 3;
        billingText = `${price}/month ($${totalAmount.toFixed(2)} total)`;
        break;
      case '6-month':
        duration = 6;
        totalAmount = monthlyAmount * 6;
        billingText = `${price}/month ($${totalAmount.toFixed(2)} total)`;
        break;
      case '12-month':
        duration = 12;
        totalAmount = monthlyAmount * 12;
        billingText = `${price}/month ($${totalAmount.toFixed(2)} total)`;
        break;
      default:
        duration = 1;
        totalAmount = monthlyAmount;
        billingText = `${price} billed monthly`;
    }

    // Build benefits list dynamically
    const benefits = [billingText, ...baseBenefits, ...(additionalBenefits[planId] || [])];
    if (savingsMessages[planId]) {
      benefits.splice(1, 0, savingsMessages[planId]);
    }

    // Build benefits list HTML
    const benefitsHtml = benefits.map(benefit =>
      `<li><i class="bi bi-check-circle-fill text-success"></i>${benefit}</li>`
    ).join('');

    // Calculate savings percentage for display
    let savingsPercent = null;
    if (planId === '3-month') {
      savingsPercent = '17%';
    } else if (planId === '6-month') {
      savingsPercent = '33%';
    } else if (planId === '12-month') {
      savingsPercent = '50%';
    }

    const card = document.createElement('div');
    card.className = `plan-card ${borderClass} ${isCurrent ? 'disabled-plan' : ''}`;
    card.innerHTML = `
      <div class="card-header text-center">
        <h3 class="card-title mb-0">${plan.name || 'Plan'}</h3>
        ${savingsPercent ? `<div class="plan-savings badge bg-warning text-dark mt-2">Save ${savingsPercent}</div>` : ''}
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
    sub => sub.isActive && (!planId || sub.plan === planId)
  );
}

async function loadUserSubscriptions() {
  if (!userToken) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/user/current`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    const data = await handleApiResponse(res);

    userSubscriptions = data?.data?.hasActiveSubscription
      ? [data.data]
      : [];

    renderUserSubscriptions();
    toggleViews();
  } catch (err) {
    console.error('Load subscriptions failed:', err);
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

    const start = sub.currentPeriodStart
      ? new Date(sub.currentPeriodStart)
      : new Date();

    const end = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd)
      : new Date(start.getTime() + 30 * 86400000);

    const daysLeft = Math.ceil((end - new Date()) / 86400000);
    const expired = daysLeft <= 0;

    const card = document.createElement('div');
    card.className = 'subscription-card';
    card.innerHTML = `
      <h5>${planName} Plan</h5>
      <span class="subscription-status ${expired ? 'expired' : 'active'}">
        ${expired ? 'EXPIRED' : 'ACTIVE'}
      </span>
      <div>Amount: $${sub.amount?.toFixed(2) || '0.00'}/month</div>
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

  initializeStripe();
  paymentForm?.addEventListener('submit', handlePaymentSubmit);
  document
    .getElementById('confirmCancelBtn')
    ?.addEventListener('click', handleConfirmCancel);

  await loadPlans();
  if (userToken) await loadUserSubscriptions();
});
