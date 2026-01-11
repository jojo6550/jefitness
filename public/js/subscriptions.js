/**
 * Subscriptions Management JavaScript
 * Handles all subscription-related functionality
 * 
 * Features:
 * - Load and display available subscription plans
 * - Handle checkout with Stripe Elements
 * - Manage user subscriptions (view, upgrade, cancel, resume)
 * - Process payments and display status
 */

// Configuration
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000/api/v1'
    : 'https://jefitness.onrender.com/api/v1';
const STRIPE_PUBLIC_KEY = 'pk_test_51NfYT7GBrdnKY4igMADzsKlYvumrey4zqRBIcMAjzd9gvm0a3TW8rUFDaSPhvAkhXPzDcmoay4V07NeIt4EZbR5N00AhS8rNXk';

// Initialize Stripe
const stripe = Stripe(STRIPE_PUBLIC_KEY);

// Global variables
let selectedPlan = null;
let cardElement = null;
let currentSubscriptionId = null;
let userToken = null;
let availablePlans = null;

// DOM Elements
const alertContainer = document.getElementById('alertContainer');
const plansContainer = document.getElementById('plansContainer');
const plansLoading = document.getElementById('plansLoading');
const paymentForm = document.getElementById('paymentForm');
const cardErrors = document.getElementById('cardErrors');
const userSubscriptionsSection = document.getElementById('userSubscriptionsSection');
const userSubscriptionsContainer = document.getElementById('userSubscriptionsContainer');

/**
 * Initialize the page
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Subscriptions page loaded');
    
    // Get user token from localStorage
    userToken = localStorage.getItem('token');
    
    // Load subscription plans
    await loadPlans();
    
    // Load user's subscriptions if logged in
    if (userToken) {
        await loadUserSubscriptions();
    }
    
    // Initialize Stripe Elements
    initializeStripeElements();
    
    // Setup event listeners
    setupEventListeners();
});

/**
 * Initialize Stripe Elements for card input
 */
function initializeStripeElements() {
    try {
        const elements = stripe.elements();
        cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                        color: '#9ca3af'
                    }
                },
                invalid: {
                    color: '#fa755a',
                    iconColor: '#fa755a'
                }
            }
        });

        // Mount card element only when payment modal is shown
        const paymentModal = document.getElementById('paymentModal');
        paymentModal.addEventListener('shown.bs.modal', () => {
            const cardContainer = document.getElementById('cardElement');
            if (cardContainer && !cardContainer.querySelector('.StripeElement')) {
                cardElement.mount('#cardElement');
            }
        });

        console.log('✅ Stripe Elements initialized');
    } catch (error) {
        console.error('❌ Error initializing Stripe Elements:', error);
        showAlert('Failed to initialize payment system. Please refresh the page.', 'error');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Payment form submission
    if (paymentForm) {
        paymentForm.addEventListener('submit', handlePaymentSubmit);
    }

    // Card element error handling
    if (cardElement) {
        cardElement.on('change', (event) => {
            cardErrors.textContent = event.error ? event.error.message : '';
        });
    }

    // Cancel confirmation
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', handleConfirmCancel);
    }
}

/**
 * Load available subscription plans
 */
async function loadPlans() {
    try {
        const response = await fetch(`${API_BASE_URL}/subscriptions/plans`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load plans');
        }

        const data = await response.json();

        if (data.success && data.data) {
            availablePlans = data.data.plans;
            displayPlans(data.data.plans);
        }
    } catch (error) {
        console.error('❌ Error loading plans:', error);
        showAlert('Failed to load subscription plans. Prices may not be up to date.', 'error');
    }
}

/**
 * Display subscription plans
 */
function displayPlans(plans) {
    // Update existing HTML cards with dynamic prices from Stripe
    const planOrder = ['1-month', '3-month', '12-month'];

    planOrder.forEach((planKey) => {
        const plan = plans[planKey];
        if (!plan) return;

        // Find the corresponding HTML card
        const cardSelector = planKey === '1-month' ? '.plan-card:nth-child(1)' :
                           planKey === '3-month' ? '.plan-card:nth-child(2)' :
                           '.plan-card:nth-child(3)';

        const planCard = document.querySelector(`${cardSelector}`);

        if (planCard) {
            // Update price
            const priceElement = planCard.querySelector('.plan-price');
            if (priceElement) {
                priceElement.innerHTML = `
                    ${plan.displayPrice}
                    <span>/month</span>
                `;
            }

            // Update savings if exists
            if (plan.savings) {
                const savingsElement = planCard.querySelector('.plan-savings');
                if (savingsElement) {
                    savingsElement.textContent = `Save ${plan.savings}`;
                    savingsElement.style.display = 'block';
                }
            }

            // Update button onclick
            const button = planCard.querySelector('.plan-button');
            if (button) {
                button.onclick = () => selectPlan(planKey);
            }
        }
    });

    // Show the plans container
    const plansContainer = document.querySelector('.plans-container');
    if (plansContainer) {
        plansContainer.style.display = 'grid';
    }

    // Hide loading
    const plansLoading = document.getElementById('plansLoading');
    if (plansLoading) {
        plansLoading.style.display = 'none';
    }
}

/**
 * Get features for each plan tier
 */
function getPlanFeatures(planKey) {
    const features = {
        '1-month': [
            'Access to basic workouts',
            'Progress tracking',
            'Community support',
            'Mobile app access'
        ],
        '3-month': [
            'Full access to all workouts',
            'Personalized training plans',
            'Advanced progress tracking',
            'Priority community support',
            'Mobile app access',
            'Nutrition guidance'
        ],
        '12-month': [
            'Everything in 3-month plan',
            '1-on-1 trainer consultations',
            'Custom meal planning',
            'Advanced analytics',
            'Priority support',
            'Exclusive content access'
        ]
    };

    return features[planKey].map(feature => `<li>${feature}</li>`).join('');
}

/**
 * Select a plan for checkout
 */
function selectPlan(plan) {
    selectedPlan = plan;
    
    if (!userToken) {
        // Redirect to login if not authenticated
        showAlert('Please log in to subscribe', 'info');
        setTimeout(() => {
            window.location.href = '/auth.html?redirect=/subscriptions.html';
        }, 1500);
        return;
    }

    // Show payment modal
    const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    paymentModal.show();

    // Update modal title
    const planName = plan.toUpperCase().replace('-', ' ');
    document.getElementById('paymentModalLabel').textContent = `Subscribe to ${planName} Plan`;
}

/**
 * Handle payment form submission
 */
async function handlePaymentSubmit(event) {
    event.preventDefault();

    if (!selectedPlan || !cardElement) {
        showAlert('Something went wrong. Please try again.', 'error');
        return;
    }

    const email = document.getElementById('paymentEmail').value.trim();
    const cardholderName = document.getElementById('cardholderName').value.trim();

    // Validation
    if (!email || !cardholderName) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    // Show loading state
    const submitBtn = document.getElementById('submitPaymentBtn');
    const submitText = document.getElementById('submitPaymentText');
    const submitSpinner = document.getElementById('submitPaymentSpinner');

    submitBtn.disabled = true;
    submitText.style.display = 'none';
    submitSpinner.style.display = 'inline';

    try {
        // Create payment method from card element
        const { paymentMethod, error } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
            billing_details: {
                name: cardholderName,
                email: email
            }
        });

        if (error) {
            throw new Error(error.message);
        }

        // Send subscription request to backend
        const response = await fetch(`${API_BASE_URL}/subscriptions/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                email,
                paymentMethodId: paymentMethod.id,
                plan: selectedPlan
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to create subscription');
        }

        if (data.success) {
            // Success!
            showAlert(`✅ Subscription to ${selectedPlan} plan created successfully!`, 'success');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
            
            // Reset form
            paymentForm.reset();
            cardElement.clear();
            
            // Reload subscriptions
            setTimeout(() => {
                loadUserSubscriptions();
            }, 1500);
        }

    } catch (error) {
        console.error('❌ Payment error:', error);
        showAlert(`Payment failed: ${error.message}`, 'error');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitText.style.display = 'inline';
        submitSpinner.style.display = 'none';
    }
}

/**
 * Load user's subscriptions
 */
async function loadUserSubscriptions() {
    try {
        if (!userToken) return;

        // Get current user info from auth endpoint
        const response = await fetch(`${API_BASE_URL.replace('/api/v1', '')}/api/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('Could not load user profile');
            return;
        }

        const userData = await response.json();
        const userId = userData._id || userData.id;

        if (!userId) {
            console.warn('User ID not found');
            return;
        }

        // Fetch subscriptions using the current endpoint
        const subsResponse = await fetch(`${API_BASE_URL}/subscriptions/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!subsResponse.ok) {
            throw new Error('Failed to load subscriptions');
        }

        const subsData = await subsResponse.json();

        if (subsData.success && subsData.data && !subsData.data.hasSubscription) {
            // User has no subscription, show free tier message
            displayUserSubscriptions([]);
            userSubscriptionsSection.style.display = 'block';
        } else if (subsData.success && subsData.data) {
            // User has subscription, display it
            displayUserSubscriptions([subsData.data]);
            userSubscriptionsSection.style.display = 'block';
        }

    } catch (error) {
        console.error('❌ Error loading user subscriptions:', error);
    }
}

/**
 * Display user's subscriptions
 */
function displayUserSubscriptions(subscriptions) {
    userSubscriptionsContainer.innerHTML = '';

    subscriptions.forEach(sub => {
        const startDate = new Date(sub.currentPeriodStart);
        const endDate = new Date(sub.currentPeriodEnd);

        const subCard = document.createElement('div');
        subCard.className = 'subscription-card';
        subCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h5>${sub.plan.toUpperCase()} Plan</h5>
                    <span class="subscription-status ${sub.status}">${sub.status.toUpperCase()}</span>
                </div>
                <div class="text-end">
                    <div class="detail-value" style="color: var(--primary-color);">$${(sub.amount / 100).toFixed(2)}</div>
                    <small class="text-muted">/month</small>
                </div>
            </div>

            <div class="subscription-details">
                <div class="detail-item">
                    <div class="detail-label">Period Start</div>
                    <div class="detail-value">${startDate.toLocaleDateString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Next Billing</div>
                    <div class="detail-value">${endDate.toLocaleDateString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Days Left</div>
                    <div class="detail-value">${Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24))}</div>
                </div>
            </div>

            <div class="subscription-actions">
                <button class="btn-small" onclick="openUpgradeModal('${sub.stripeSubscriptionId}')">
                    <i class="bi bi-arrow-up me-1"></i>Upgrade/Change
                </button>
                <button class="btn-small" onclick="downloadInvoices('${sub.stripeSubscriptionId}')">
                    <i class="bi bi-file-earmark-pdf me-1"></i>Invoices
                </button>
                ${sub.status !== 'canceled' ? `
                    <button class="btn-small danger" onclick="openCancelModal('${sub.stripeSubscriptionId}')">
                        <i class="bi bi-x-circle me-1"></i>Cancel
                    </button>
                ` : `
                    <button class="btn-small success" onclick="resumeSubscription('${sub.stripeSubscriptionId}')">
                        <i class="bi bi-play-circle me-1"></i>Resume
                    </button>
                `}
            </div>
        `;

        userSubscriptionsContainer.appendChild(subCard);
    });
}

/**
 * Open upgrade/change plan modal
 */
function openUpgradeModal(subscriptionId) {
    currentSubscriptionId = subscriptionId;
    const planSelectionModal = new bootstrap.Modal(document.getElementById('planSelectionModal'));

    // Load available plans for upgrade using actual prices
    const container = document.getElementById('planSelectionContainer');
    let plansHtml = '<p class="text-muted mb-3">Select a different plan to upgrade or downgrade:</p><div style="display: grid; gap: 15px;">';

    if (availablePlans) {
        const planOrder = ['1-month', '3-month', '6-month', '12-month'];
        planOrder.forEach(planKey => {
            const plan = availablePlans[planKey];
            if (plan) {
                plansHtml += `<button class="btn btn-outline-primary w-100" onclick="changeSubscriptionPlan('${planKey}')">${plan.duration} - ${plan.displayPrice}/mo</button>`;
            }
        });
    } else {
        // Fallback to hardcoded if plans not loaded
        plansHtml += `
            <button class="btn btn-outline-primary w-100" onclick="changeSubscriptionPlan('1-month')">1-Month Plan - $9.99/mo</button>
            <button class="btn btn-outline-primary w-100" onclick="changeSubscriptionPlan('3-month')">3-Month Plan - $27.99/mo</button>
            <button class="btn btn-outline-primary w-100" onclick="changeSubscriptionPlan('6-month')">6-Month Plan - $49.99/mo</button>
            <button class="btn btn-outline-primary w-100" onclick="changeSubscriptionPlan('12-month')">12-Month Plan - $89.99/mo</button>
        `;
    }

    plansHtml += '</div>';
    container.innerHTML = plansHtml;

    planSelectionModal.show();
}

/**
 * Change subscription plan
 */
async function changeSubscriptionPlan(newPlan) {
    if (!currentSubscriptionId) {
        showAlert('Subscription ID not found', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/subscriptions/${currentSubscriptionId}/update-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                plan: newPlan
            })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`✅ Subscription updated to ${newPlan} plan!`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('planSelectionModal')).hide();
            setTimeout(() => {
                loadUserSubscriptions();
            }, 1500);
        } else {
            throw new Error(data.error?.message || 'Failed to update plan');
        }

    } catch (error) {
        console.error('❌ Error updating plan:', error);
        showAlert(`Failed to update plan: ${error.message}`, 'error');
    }
}

/**
 * Open cancel subscription confirmation modal
 */
function openCancelModal(subscriptionId) {
    currentSubscriptionId = subscriptionId;
    const modal = new bootstrap.Modal(document.getElementById('cancelConfirmModal'));
    modal.show();
}

/**
 * Handle confirmed cancellation
 */
async function handleConfirmCancel() {
    if (!currentSubscriptionId) {
        showAlert('Subscription ID not found', 'error');
        return;
    }

    const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

    try {
        const response = await fetch(
            `${API_BASE_URL}/subscriptions/${currentSubscriptionId}/cancel`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    atPeriodEnd
                })
            }
        );

        const data = await response.json();

        if (data.success) {
            const message = atPeriodEnd
                ? '✅ Subscription will be canceled at the end of your billing period'
                : '✅ Subscription has been canceled immediately';
            showAlert(message, 'success');
            
            bootstrap.Modal.getInstance(document.getElementById('cancelConfirmModal')).hide();
            document.getElementById('atPeriodEndCheck').checked = false;
            
            setTimeout(() => {
                loadUserSubscriptions();
            }, 1500);
        } else {
            throw new Error(data.error?.message || 'Failed to cancel subscription');
        }

    } catch (error) {
        console.error('❌ Error canceling subscription:', error);
        showAlert(`Failed to cancel subscription: ${error.message}`, 'error');
    }
}

/**
 * Resume a canceled subscription
 */
async function resumeSubscription(subscriptionId) {
    if (!confirm('Are you sure you want to resume this subscription?')) {
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/subscriptions/${subscriptionId}/resume`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            }
        );

        const data = await response.json();

        if (data.success) {
            showAlert('✅ Subscription has been resumed', 'success');
            setTimeout(() => {
                loadUserSubscriptions();
            }, 1500);
        } else {
            throw new Error(data.error?.message || 'Failed to resume subscription');
        }

    } catch (error) {
        console.error('❌ Error resuming subscription:', error);
        showAlert(`Failed to resume subscription: ${error.message}`, 'error');
    }
}

/**
 * Download invoices for a subscription
 */
async function downloadInvoices(subscriptionId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/subscriptions/${subscriptionId}/invoices`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = await response.json();

        if (data.success && data.data.invoices.length > 0) {
            showAlert('📄 Opening invoice...', 'info');
            // Open first invoice URL
            const invoice = data.data.invoices[0];
            if (invoice.url) {
                window.open(invoice.url, '_blank');
            } else {
                showAlert('Invoice URL not available', 'error');
            }
        } else {
            showAlert('No invoices found for this subscription', 'info');
        }

    } catch (error) {
        console.error('❌ Error fetching invoices:', error);
        showAlert('Failed to fetch invoices', 'error');
    }
}

/**
 * Display alert message
 */
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

    // Auto-remove after 5 seconds
    setTimeout(() => {
        alertDiv.classList.add('animate__fadeOut');
        setTimeout(() => alertDiv.remove(), 500);
    }, 5000);
}

/**
 * Logout function
 */
function logout() {
    localStorage.removeItem('token');
    window.location.href = '/auth.html';
}
