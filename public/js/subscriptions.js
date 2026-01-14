/**
 * subscriptions.js
 * Handles subscription plans, Stripe payments, and user subscriptions
 */

window.API_BASE = window.ApiConfig.getAPI_BASE() + '/api/v1/subscriptions'; // ⚠️ ensure this points to your subscriptions router

const STRIPE_PUBLIC_KEY = 'pk_test_51NfYT7GBrdnKY4igMADzsKlYvumrey4zqRBIcMAjzd9gvm0a3TW8rUFDaSPhvAkhXPzDcmoay4V07NeIt4EZbR5N00AhS8rNXk';
const stripe = Stripe(STRIPE_PUBLIC_KEY);
const DEBUG = true;

let selectedPlanId = null;
let cardElement = null;
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
async function handleApiResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.error('Non-JSON response:', text.slice(0, 500));
    throw new Error(`Server returned non-JSON (${res.status})`);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

function showAlert(msg, type = 'info') {
  if (!alertContainer) return;
  const icons = { success: 'bi-check-circle', error: 'bi-exclamation-circle', info: 'bi-info-circle', warning: 'bi-exclamation-triangle' };
  alertContainer.innerHTML = `
    <div class="alert alert-${type} animate__animated animate__fadeIn">
      <i class="bi ${icons[type]} me-2"></i>${msg}
    </div>`;
  setTimeout(() => {
    const alert = alertContainer.firstElementChild;
    if (alert) {
      alert.classList.add('animate__fadeOut');
      setTimeout(() => alert.remove(), 500);
    }
  }, 5000);
}

function log(...args) { if (DEBUG) console.log(...args); }

/* --------------------------------------------------
   Stripe Elements
-------------------------------------------------- */
function initializeStripe() {
  try {
    const elements = stripe.elements();
    cardElement = elements.create('card', {
      style: {
        base: { fontSize: '16px', color: '#424770', '::placeholder': { color: '#9ca3af' } },
        invalid: { color: '#fa755a', iconColor: '#fa755a' }
      }
    });

    const modal = document.getElementById('paymentModal');
    modal?.addEventListener('shown.bs.modal', () => {
      if (!document.querySelector('#cardElement .StripeElement')) cardElement.mount('#cardElement');
    });

    cardElement.on('change', e => { if (cardErrors) cardErrors.textContent = e.error?.message || ''; });
    log('Stripe initialized');
  } catch (err) { console.error('Stripe init failed:', err); showAlert('Failed to load payment system', 'error'); }
}

/* --------------------------------------------------
   Plans
-------------------------------------------------- */
async function loadPlans() {
  try {
    const res = await fetch(`${API_BASE}/plans`);
    const data = await handleApiResponse(res);
    availablePlans = data?.data?.plans || [];
    renderPlans();
  } catch (err) {
    console.error('Load plans failed:', err);
    showAlert('Failed to load subscription plans', 'error');
  } finally { if (plansLoading) plansLoading.style.display = 'none'; }
}

function renderPlans() {
  if (!plansContainer) return;
  plansContainer.innerHTML = '';
  availablePlans.forEach(plan => {
    const isCurrent = hasActiveSubscription(plan.id);
    const price = plan.displayPrice || (plan.amount ? `$${(plan.amount/100).toFixed(2)}` : 'N/A');

    const card = document.createElement('div');
    card.className = `plan-card ${isCurrent ? 'disabled-plan' : ''}`;
    card.innerHTML = `
      <h5>${plan.name}</h5>
      <div class="plan-price">${price}<span>/month</span></div>
      ${plan.savings ? `<div class="plan-savings">Save ${plan.savings}</div>` : ''}
      <button class="plan-button" ${isCurrent ? 'disabled' : ''}>${isCurrent ? 'Current Plan' : 'Select Plan'}</button>
    `;
    if (!isCurrent) card.querySelector('button').onclick = () => selectPlan(plan.id);
    plansContainer.appendChild(card);
  });
  plansContainer.style.display = 'grid';
}

/* --------------------------------------------------
   User Subscriptions
-------------------------------------------------- */
function hasActiveSubscription(planId=null) {
  return userSubscriptions.some(sub => sub.isActive && (!planId || sub.plan === planId));
}

async function loadUserSubscriptions() {
  if (!userToken) return;
  try {
    const res = await fetch(`${API_BASE}/user/current`, { headers: { Authorization: `Bearer ${userToken}` } });
    const data = await handleApiResponse(res);
    userSubscriptions = data?.data?.hasActiveSubscription ? [data.data] : [];
    renderUserSubscriptions();
    toggleViews();
  } catch (err) { console.error('Load subscriptions failed:', err); }
}

function renderUserSubscriptions() {
  if (!userSubscriptionsContainer) return;
  userSubscriptionsContainer.innerHTML = '';
  userSubscriptions.forEach(sub => {
    const planName = (sub.plan || '').replace('-', ' ').toUpperCase();
    const start = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : new Date();
    const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date(start.getTime() + 30*86400000);
    const daysLeft = Math.ceil((end - new Date())/86400000);
    const expired = daysLeft <= 0;

    const card = document.createElement('div');
    card.className = 'subscription-card';
    card.innerHTML = `
      <h5>${planName} Plan</h5>
      <span class="subscription-status ${expired ? 'expired' : 'active'}">${expired ? 'EXPIRED' : 'ACTIVE'}</span>
      <div>Amount: $${sub.amount?.toFixed(2)||'0.00'}/month</div>
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

function toggleViews() {
  const hasSub = hasActiveSubscription();
  if (userSubscriptionsSection) userSubscriptionsSection.style.display = hasSub ? 'block' : 'none';
  if (plansContainer) plansContainer.style.display = hasSub ? 'none' : 'grid';
}

/* --------------------------------------------------
   Plan Selection & Payment
-------------------------------------------------- */
async function selectPlan(planId) {
  selectedPlanId = planId;
  if (!userToken) {
    showAlert('Please log in to subscribe', 'info');
    return setTimeout(() => window.location.href = `/pages/login.html?redirect=/subscriptions.html`, 1500);
  }
  await loadUserSubscriptions();
  if (hasActiveSubscription(planId)) return showAlert('You already have this plan', 'warning');
  new bootstrap.Modal(document.getElementById('paymentModal')).show();
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  if (!selectedPlanId || !cardElement) return showAlert('Payment not ready', 'error');

  const email = document.getElementById('paymentEmail')?.value.trim();
  const name = document.getElementById('cardholderName')?.value.trim();
  if (!email || !name) return showAlert('Please fill in all fields', 'error');

  const btn = document.getElementById('submitPaymentBtn');
  const text = document.getElementById('submitPaymentText');
  const spinner = document.getElementById('submitPaymentSpinner');

  btn.disabled = true; text.style.display = 'none'; spinner.style.display = 'inline';

  try {
    const { paymentMethod, error } = await stripe.createPaymentMethod({ type:'card', card:cardElement, billing_details:{name,email} });
    if (error) throw new Error(error.message);

    const res = await fetch(`${API_BASE}/create`, {
      method: 'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${userToken}` },
      body: JSON.stringify({ plan:selectedPlanId, email, paymentMethodId: paymentMethod.id })
    });

    await handleApiResponse(res);
    showAlert('Subscription successful!', 'success');
    bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
    paymentForm.reset(); cardElement.clear();
    await loadUserSubscriptions();
    window.location.href='dashboard.html';
  } catch (err) { console.error('Payment failed:', err); showAlert(err.message,'error'); }
  finally { btn.disabled=false; text.style.display='inline'; spinner.style.display='none'; }
}

/* --------------------------------------------------
   Cancel Subscription
-------------------------------------------------- */
async function handleConfirmCancel() {
  if (!currentSubscriptionId) return showAlert('Subscription not found', 'error');
  const atPeriodEnd = document.getElementById('atPeriodEndCheck')?.checked || false;

  try {
    const res = await fetch(`${API_BASE}/${currentSubscriptionId}/cancel`, {
      method:'DELETE',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${userToken}` },
      body: JSON.stringify({ atPeriodEnd })
    });
    await handleApiResponse(res);
    showAlert(atPeriodEnd ? 'Subscription will end at period end':'Subscription canceled','success');
    bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
    document.getElementById('atPeriodEndCheck').checked=false;
    setTimeout(loadUserSubscriptions, 1000);
  } catch(err) { console.error('Cancel failed:', err); showAlert(err.message,'error'); }
}

/* --------------------------------------------------
   Init
-------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  log('Subscriptions page loaded');
  initializeStripe();
  paymentForm?.addEventListener('submit', handlePaymentSubmit);
  document.getElementById('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);
  await loadPlans();
  if (userToken) await loadUserSubscriptions();
});
