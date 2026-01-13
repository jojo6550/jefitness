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

window.API_BASE = window.ApiConfig.getAPI_BASE();
const STRIPE_PUBLIC_KEY = 'pk_test_51NfYT7GBrdnKY4igMADzsKlYvumrey4zqRBIcMAjzd9gvm0a3TW8rUFDaSPhvAkhXPzDcmoay4V07NeIt4EZbR5N00AhS8rNXk';

// Initialize Stripe
const stripe = Stripe(STRIPE_PUBLIC_KEY);
console.log('API Base URL:', window.API_BASE);


// Global variables
let selectedPlan = null;
let cardElement = null;
let currentSubscriptionId = null;
let userToken = null;
let availablePlans = null;
let hasActiveSubscription = false;

// DOM Elements
const alertContainer = document.getElementById('alertContainer');
const plansContainer = document.getElementById('plansContainer');
const plansLoading = document.getElementById('plansLoading');
const paymentForm = document.getElementById('paymentForm');
const cardErrors = document.getElementById('cardErrors');
const userSubscriptionsSection = document.getElementById('userSubscriptionsSection');
const userSubscriptionsContainer = document.getElementById('userSubscriptionsContainer');

/**
 * Safe API response handler - prevents JSON.parse errors
 * @param {Response} response - Fetch response object
 * @returns {Promise<Object>} Parsed JSON data
 */
async function handleApiResponse(response) {
    const contentType = response.headers.get('content-type');
    
    // Check if response is JSON
    if (!contentType || !contentType.includes('application/json')) {
        // Try to get text for error logging
        const text = await response.text();
        console.error('Non-JSON response received:', text.substring(0, 500));
        throw new Error(`Server returned non-JSON response (${response.status}): ${response.statusText}`);
    }
    
    // Check if response is OK
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}

/**
 * Initialize the page
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Subscriptions page loaded');
    console.log('dev good');
    
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
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/plans`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await handleApiResponse(response);

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
    console.log('📊 Displaying plans:', plans);

    // Backend returns an array, convert to object keyed by plan id
    // Each plan has an 'id' field like '1-month', '3-month', etc.
    let plansObject = {};
    
    if (Array.isArray(plans)) {
        // Convert array to object keyed by plan id
        plans.forEach(plan => {
            if (plan && plan.id) {
                plansObject[plan.id] = plan;
            }
        });
        console.log('🔄 Converted plans array to object:', plansObject);
    } else if (typeof plans === 'object') {
        // Already an object, use as-is
        plansObject = plans;
    }

    // Update existing HTML cards with dynamic prices from Stripe
    const planOrder = ['1-month', '3-month', '6-month', '12-month'];

    const planCards = document.querySelectorAll('.plan-card');
    console.log('🎴 Found plan cards:', planCards.length);

    planOrder.forEach((planKey, index) => {
        const plan = plansObject[planKey];
        console.log(`🔍 Processing ${planKey}:`, plan);

        if (!plan) {
            console.warn(`⚠️ No plan data for ${planKey}`);
            return;
        }

        const planCard = planCards[index];
        console.log(`🎯 Card ${index} for ${planKey}:`, planCard);

        if (planCard) {
            // Check if user has active subscription and this is not the active plan
            let isDisabled = false;
            if (hasActiveSubscription && userSubscriptions && userSubscriptions.length > 0) {
                const activePlan = userSubscriptions[0];
                // Disable if this plan is not the active one
                isDisabled = activePlan.plan !== planKey;
            }

            // Apply disabled styling
            if (isDisabled) {
                planCard.classList.add('disabled-plan');
            } else {
                planCard.classList.remove('disabled-plan');
            }

            // Update price
            const priceElement = planCard.querySelector('.plan-price');
            if (priceElement) {
                // Handle Stripe amounts (in cents) vs display prices
                let displayPrice = plan.displayPrice;
                if (plan.amount && !plan.displayPrice) {
                    // Convert from cents to dollars if displayPrice not provided
                    displayPrice = `$${(plan.amount / 100).toFixed(2)}`;
                }
                priceElement.innerHTML = `
                    ${displayPrice}
                    <span>/month</span>
                `;
                console.log(`💰 Updated price for ${planKey}: ${displayPrice} (original: ${plan.displayPrice || plan.amount})`);
            } else {
                console.warn(`⚠️ No price element found for ${planKey}`);
            }

            // Update savings if exists
            if (plan.savings) {
                const savingsElement = planCard.querySelector('.plan-savings');
                if (savingsElement) {
                    savingsElement.textContent = `Save ${plan.savings}`;
                    savingsElement.style.display = 'block';
                    console.log(`💸 Updated savings for ${planKey}: ${plan.savings}`);
                }
            }

            // Update button onclick and disabled state
            const button = planCard.querySelector('.plan-button');
            if (button) {
                if (isDisabled) {
                    button.disabled = true;
                    button.textContent = 'Current Plan';
                    button.onclick = null;
                } else {
                    button.disabled = false;
                    button.textContent = 'Select Plan';
                    button.onclick = () => selectPlan(planKey);
                }
                console.log(`🔘 Updated button for ${planKey}`);
            }
        } else {
            console.warn(`⚠️ No card found for ${planKey} at index ${index}`);
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
async function selectPlan(plan) {
    selectedPlan = plan;

    if (!userToken) {
        // Redirect to login if not authenticated
        showAlert('Please log in to subscribe', 'info');
        setTimeout(() => {
            window.location.href = '/pages/login.html?redirect=/subscriptions.html';
        }, 1500);
        return;
    }

    // Check if user already has an active subscription
    if (hasActiveSubscription) {
        showAlert('You already have an active subscription. You can only cancel your current subscription.', 'warning');
        return;
    }

    // Open the payment modal instead of redirecting to Stripe Checkout
    const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    paymentModal.show();
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
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/create`, {
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

        const data = await handleApiResponse(response);

        if (data.success) {
            // Success!
            showAlert(`✅ Subscription to ${selectedPlan} plan created successfully!`, 'success');

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();

            // Reset form
            paymentForm.reset();
            cardElement.clear();

            // Update user subscription status and navigate to dashboard
            setTimeout(() => {
                // Reload subscriptions to update status
                loadUserSubscriptions();

                // Navigate to dashboard page
                window.location.href = 'public/pages/dashboard.html';
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

        // Fetch subscriptions using the current endpoint
        const subsResponse = await fetch(`${window.API_BASE}/api/v1/subscriptions/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        const subsData = await handleApiResponse(subsResponse);

        if (subsData.success && subsData.data && !subsData.data.hasSubscription) {
            // User has no subscription, show free tier
            hasActiveSubscription = false;
            displayUserSubscriptions([]);
            userSubscriptionsSection.style.display = 'none';
            plansContainer.style.display = 'grid'; // Show plans for purchase
            // Re-display plans to ensure they're not greyed out
            if (availablePlans) {
                displayPlans(availablePlans);
            }
        } else if (subsData.success && subsData.data) {
            // User has subscription, hide plans and only show subscription details
            hasActiveSubscription = true;
            displayUserSubscriptions([subsData.data]);
            userSubscriptionsSection.style.display = 'block';
            plansContainer.style.display = 'none'; // Hide plans completely
            
            // Hide the loading spinner and title/description
            if (plansLoading) {
                plansLoading.style.display = 'none';
            }
            
            // Hide the page header for choosing plans
            const pageHeader = document.querySelector('.text-center.mb-5');
            if (pageHeader) {
                pageHeader.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('❌ Error loading user subscriptions:', error);
    }
}

/**
 * Display user's subscriptions
 */
function displayUserSubscriptions(subscriptions) {
    console.log('📊 Displaying user subscriptions:', subscriptions);

    userSubscriptionsContainer.innerHTML = '';

    if (!subscriptions || subscriptions.length === 0) {
        console.log('ℹ️ No subscriptions to display');
        return;
    }

    subscriptions.forEach(sub => {
        console.log('🔍 Processing subscription:', sub);

        // Handle different data structures - subscription data comes from User model
        const plan = sub.subscriptionType || sub.plan || 'FREE';
        const status = sub.subscriptionStatus || sub.status || 'active';
        const stripeSubscriptionId = sub.stripeSubscriptionId || sub.id;

        console.log('📋 Plan:', plan, 'Status:', status, 'ID:', stripeSubscriptionId);

        // Skip if plan is still undefined
        if (!plan || plan === 'undefined') {
            console.warn('⚠️ Skipping subscription with invalid plan:', sub);
            return;
        }

        // Handle dates - may be null/undefined
        const startDate = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : new Date();

        // Calculate end date based on plan type if not provided
        let endDate;
        if (sub.currentPeriodEnd) {
            endDate = new Date(sub.currentPeriodEnd);
        } else {
            // Calculate based on plan type
            const planDurations = {
                '1-month': 30,
                '3-month': 90,
                '6-month': 180,
                '12-month': 365
            };
            const durationDays = planDurations[plan.toLowerCase()] || 30;
            endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        }

        // Calculate amount based on plan type (simplified pricing)
        const planPricing = {
            '1-month': 29.99,
            '3-month': 79.99,
            '6-month': 149.99,
            '12-month': 279.99,
            'free': 0
        };
        const amount = planPricing[plan.toLowerCase()] || 0;

        // Calculate days left
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));

        console.log('💰 Amount:', amount, 'Days left:', daysLeft);

        const subCard = document.createElement('div');
        subCard.className = 'subscription-card';
        subCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h5>${plan.toUpperCase()} Plan</h5>
                    <span class="subscription-status ${status}">${status.toUpperCase()}</span>
                </div>
                <div class="text-end">
                    <div class="detail-value" style="color: var(--primary-color);">\$${amount.toFixed(2)}</div>
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
                    <div class="detail-value">${daysLeft > 0 ? daysLeft : 'Expired'}</div>
                </div>
            </div>

            <div class="subscription-actions">
                <button class="btn-small" onclick="openUpgradeModal('${stripeSubscriptionId}')">
                    <i class="bi bi-arrow-up me-1"></i>Upgrade/Change
                </button>
                <button class="btn-small" onclick="downloadInvoices('${stripeSubscriptionId}')">
                    <i class="bi bi-file-earmark-pdf me-1"></i>Invoices
                </button>
                ${status !== 'canceled' && status !== 'cancelled' ? `
                    <button class="btn-small danger" onclick="openCancelModal('${stripeSubscriptionId}')">
                        <i class="bi bi-x-circle me-1"></i>Cancel
                    </button>
                ` : `
                    <button class="btn-small success" onclick="resumeSubscription('${stripeSubscriptionId}')">
                        <i class="bi bi-play-circle me-1"></i>Resume
                    </button>
                `}
            </div>
        `;

        userSubscriptionsContainer.appendChild(subCard);
    });
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
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/cancel`,
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

        const data = await handleApiResponse(response);

        if (data.success) {
            const message = atPeriodEnd
                ? '✅ Subscription will be canceled at the end of your billing period and you will be moved to the free tier'
                : '✅ Subscription has been canceled immediately. You are now on the free tier';
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
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subscriptionId}/resume`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            }
        );

        const data = await handleApiResponse(response);

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
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subscriptionId}/invoices`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = await handleApiResponse(response);

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
    window.location.href = '/pages/login.html';
}
