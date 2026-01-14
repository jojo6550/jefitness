/**
 * subscriptions.js - Fully refactored
 * Handles subscription management, Stripe Elements, and payment flow
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();
const STRIPE_PUBLIC_KEY = 'pk_test_51NfYT7GBrdnKY4igMADzsKlYvumrey4zqRBIcMAjzd9gvm0a3TW8rUFDaSPhvAkhXPzDcmoay4V07NeIt4EZbR5N00AhS8rNXk';
const stripe = Stripe(STRIPE_PUBLIC_KEY);

// Debug mode
const DEBUG = true;

// Globals
let selectedPlan = null;
let cardElement = null;
let currentSubscriptionId = null;
let userToken = localStorage.getItem('token');
let availablePlans = [];
let userSubscriptions = [];

// DOM Elements
const alertContainer = document.getElementById('alertContainer');
const plansContainer = document.getElementById('plansContainer');
const plansLoading = document.getElementById('plansLoading');
const paymentForm = document.getElementById('paymentForm');
const cardErrors = document.getElementById('cardErrors');
const userSubscriptionsSection = document.getElementById('userSubscriptionsSection');
const userSubscriptionsContainer = document.getElementById('userSubscriptionsContainer');

// -------------------------------
// Utilities
// -------------------------------
async function handleApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 500));
        throw new Error(`Server returned non-JSON response (${response.status})`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
    return data;
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} animate__animated animate__fadeIn`;
    alertDiv.innerHTML = `
        ${type === 'success' ? '<i class="bi bi-check-circle me-2"></i>' : ''}
        ${type === 'error' ? '<i class="bi bi-exclamation-circle me-2"></i>' : ''}
        ${type === 'info' ? '<i class="bi bi-info-circle me-2"></i>' : ''}
        ${message}
    `;
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.classList.add('animate__fadeOut');
        setTimeout(() => alertDiv.remove(), 500);
    }, 5000);
}

// -------------------------------
// Stripe Elements
// -------------------------------
function initializeStripeElements() {
    try {
        const elements = stripe.elements();
        cardElement = elements.create('card', {
            style: {
                base: { fontSize: '16px', color: '#424770', '::placeholder': { color: '#9ca3af' } },
                invalid: { color: '#fa755a', iconColor: '#fa755a' }
            }
        });

        const paymentModal = document.getElementById('paymentModal');
        paymentModal.addEventListener('shown.bs.modal', () => {
            const cardContainer = document.getElementById('cardElement');
            if (cardContainer && !cardContainer.querySelector('.StripeElement')) cardElement.mount('#cardElement');
        });

        if (DEBUG) console.log('✅ Stripe Elements initialized');
    } catch (err) {
        console.error('❌ Stripe init error:', err);
        showAlert('Payment system failed to load. Refresh the page.', 'error');
    }
}

// -------------------------------
// Event Listeners
// -------------------------------
function setupEventListeners() {
    if (paymentForm) paymentForm.addEventListener('submit', handlePaymentSubmit);
    if (cardElement) cardElement.on('change', e => cardErrors.textContent = e.error?.message || '');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', handleConfirmCancel);
}

// -------------------------------
// Load Plans
// -------------------------------
async function loadPlans() {
    try {
        const response = await fetch(`${API_BASE}/api/v1/subscriptions/plans`);
        const data = await handleApiResponse(response);
        if (data.success && data.data) {
            availablePlans = data.data.plans || [];
            displayPlans(availablePlans);
        }
    } catch (err) {
        console.error('❌ Error loading plans:', err);
        showAlert('Failed to load subscription plans', 'error');
    }
}

function displayPlans(plans) {
    if (!plansContainer) return;

    plansContainer.innerHTML = '';
    plans.forEach(plan => {
        const price = plan.displayPrice || (plan.amount ? `$${(plan.amount/100).toFixed(2)}` : 'N/A');
        const isDisabled = hasActiveSubscription(plan.id);
        const planCard = document.createElement('div');
        planCard.className = `plan-card ${isDisabled ? 'disabled-plan' : ''}`;
        planCard.innerHTML = `
            <h5>${plan.name}</h5>
            <div class="plan-price">${price}<span>/month</span></div>
            ${plan.savings ? `<div class="plan-savings">Save ${plan.savings}</div>` : ''}
            <button class="plan-button" ${isDisabled ? 'disabled' : ''}>${isDisabled ? 'Current Plan' : 'Select Plan'}</button>
        `;
        plansContainer.appendChild(planCard);

        const btn = planCard.querySelector('.plan-button');
        if (btn && !isDisabled) btn.onclick = () => selectPlan(plan.id);
    });

    plansContainer.style.display = 'grid';
    if (plansLoading) plansLoading.style.display = 'none';
}

function hasActiveSubscription(planId = null) {
    return userSubscriptions.some(sub => sub.isActive && (!planId || sub.plan === planId));
}

// -------------------------------
// Select Plan & Payment
// -------------------------------
async function selectPlan(planId) {
    selectedPlan = planId;
    if (!userToken) {
        showAlert('Login required to subscribe', 'info');
        setTimeout(() => window.location.href = `/pages/login.html?redirect=/subscriptions.html`, 1500);
        return;
    }
    await loadUserSubscriptions(); // Always refresh subscriptions
    if (hasActiveSubscription(planId)) {
        showAlert('You already have this subscription', 'warning');
        return;
    }
    const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    paymentModal.show();
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedPlan || !cardElement) return showAlert('Payment setup error', 'error');

    const email = document.getElementById('paymentEmail').value.trim();
    const name = document.getElementById('cardholderName').value.trim();
    if (!email || !name) return showAlert('Fill all fields', 'error');

    const submitBtn = document.getElementById('submitPaymentBtn');
    const submitText = document.getElementById('submitPaymentText');
    const submitSpinner = document.getElementById('submitPaymentSpinner');
    submitBtn.disabled = true; submitText.style.display = 'none'; submitSpinner.style.display = 'inline';

    try {
        const { paymentMethod, error } = await stripe.createPaymentMethod({ 
            type: 'card', 
            card: cardElement, 
            billing_details: { name, email } 
        });
        if (error) throw new Error(error.message);

        const response = await fetch(`${API_BASE}/api/v1/subscriptions/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
            body: JSON.stringify({ email, paymentMethodId: paymentMethod.id, plan: selectedPlan })
        });

        const data = await handleApiResponse(response);
        if (data.success) {
            showAlert('Subscription successful!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
            paymentForm.reset(); cardElement.clear();
            await loadUserSubscriptions();
            window.location.href = 'dashboard.html';
        }
    } catch (err) {
        console.error('❌ Payment failed:', err);
        showAlert(`Payment failed: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false; submitText.style.display = 'inline'; submitSpinner.style.display = 'none';
    }
}

// -------------------------------
// User Subscriptions
// -------------------------------
async function loadUserSubscriptions() {
    if (!userToken) return;

    try {
        const response = await fetch(`${API_BASE}/api/v1/subscriptions/user/current`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const data = await handleApiResponse(response);
        userSubscriptions = data.success && data.data ? [data.data] : [];
        displayUserSubscriptions(userSubscriptions);
        togglePlansVisibility();
    } catch (err) {
        console.error('❌ Load subscriptions error:', err);
    }
}

function togglePlansVisibility() {
    if (hasActiveSubscription()) {
        userSubscriptionsSection.style.display = 'block';
        plansContainer.style.display = 'none';
    } else {
        userSubscriptionsSection.style.display = 'none';
        plansContainer.style.display = 'grid';
    }
}

function displayUserSubscriptions(subs) {
    if (!userSubscriptionsContainer) return;
    userSubscriptionsContainer.innerHTML = '';

    subs.forEach(sub => {
        const plan = sub.plan || sub.subscription?.plan;
        if (!plan) return;

        const startDate = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : new Date();
        const endDate = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date(startDate.getTime() + 30*24*60*60*1000);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000*60*60*24));
        const isExpired = daysLeft <= 0;
        const status = isExpired ? 'EXPIRED' : (sub.isActive ? 'ACTIVE' : 'INACTIVE');

        const card = document.createElement('div');
        card.className = 'subscription-card';
        card.innerHTML = `
            <h5>${plan.replace('-', ' ').toUpperCase()} Plan</h5>
            <span class="subscription-status ${isExpired ? 'expired' : 'active'}">${status}</span>
            <div>Amount: $${sub.amount?.toFixed(2) || 0}/month</div>
            <div>Next Billing: ${endDate.toLocaleDateString()}</div>
            <div>Days Left: ${isExpired ? 'Expired' : daysLeft}</div>
            <div class="subscription-actions">
                ${!isExpired ? `<button onclick="downloadInvoices('${sub.stripeSubscriptionId || ''}')">Invoices</button>` : ''}
                ${!isExpired && status !== 'EXPIRED' ? `<button class="danger" onclick="openCancelModal('${sub.stripeSubscriptionId || ''}')">Cancel</button>` : ''}
                ${isExpired ? `<button onclick="openUpgradeModal('${sub.stripeSubscriptionId || ''}')">Renew/Upgrade</button>` : ''}
            </div>
        `;
        userSubscriptionsContainer.appendChild(card);
    });
}

// -------------------------------
// Cancel Subscription
// -------------------------------
async function handleConfirmCancel() {
    if (!currentSubscriptionId) return showAlert('Subscription ID not found', 'error');
    const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

    try {
        const response = await fetch(`${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/cancel`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
            body: JSON.stringify({ atPeriodEnd })
        });
        const data = await handleApiResponse(response);
        if (data.success) {
            showAlert(atPeriodEnd ? 'Subscription will end at period end' : 'Subscription canceled', 'success');
            bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
            document.getElementById('atPeriodEndCheck').checked = false;
            setTimeout(loadUserSubscriptions, 1500);
        }
    } catch (err) {
        console.error('❌ Cancel subscription error:', err);
        showAlert(`Failed to cancel: ${err.message}`, 'error');
    }
}

// -------------------------------
// Init
// -------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    if (DEBUG) console.log('🚀 Subscriptions page loaded');
    initializeStripeElements();
    setupEventListeners();
    await loadPlans();
    if (userToken) await loadUserSubscriptions();
});
