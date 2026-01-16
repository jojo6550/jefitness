/**
 * Dashboard
 * Main user dashboard functionality
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Initialize dashboard
 */
async function initDashboard() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'pages/login.html';
        return;
    }

    try {
        // Load user data
        await loadUserData();
        
        // Check for admin link visibility
        const userRole = localStorage.getItem('userRole');
        if (userRole === 'admin') {
            const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
            if (adminLink) adminLink.style.display = '';
        }
    } catch (err) {
        logger.error('Dashboard initialization failed', { error: err?.message });
    }
}

/**
 * Load user data
 */
async function loadUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/users/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            logger.warn('User data fetch failed');
            return;
        }

        const user = await response.json();
        renderUserData(user);
    } catch (err) {
        logger.error('Failed to load user data', { error: err?.message });
    }
}

/**
 * Render user data
 */
function renderUserData(user) {
    const nameElement = document.getElementById('userName');
    const emailElement = document.getElementById('userEmail');

    if (nameElement) nameElement.textContent = `${user.firstName} ${user.lastName}`;
    if (emailElement) emailElement.textContent = user.email;
}

/**
 * Load subscription status
 */
async function loadSubscriptionStatus() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/user/current`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load subscription');
        }

        const data = await response.json();
        const subscription = data.data;

        const statusElement = document.getElementById('subscriptionStatus');
        const actionsElement = document.getElementById('subscriptionActions');
        const upgradeBtn = document.getElementById('upgradeSubscriptionBtn');
        const subscriptionCard = document.getElementById('subscriptionInfoCard');

        if (!statusElement || !actionsElement) {
            logger.warn('Subscription status elements not found');
            return;
        }

        if (subscription?.hasActiveSubscription) {
            logger.debug('User has active subscription', { status: subscription.status });
            
            // Show cancel button for active subscriptions
            const cancelBtn = document.getElementById('cancel-subscription-btn');
            if (cancelBtn) {
                logger.debug('Showing cancel button');
                cancelBtn.classList.remove('d-none');
            }

            // Hide subscription card for users with active subscription (they already have one)
            if (subscriptionCard) {
                logger.debug('Subscription card hidden for user with active subscription');
                subscriptionCard.style.display = 'none';
            }
        } else {
            // Show upgrade button for non-active subscriptions
            logger.debug('Showing upgrade button');
            const cancelBtn = document.getElementById('cancel-subscription-btn');
            if (cancelBtn) {
                cancelBtn.classList.add('d-none');
            }

            if (subscriptionCard) {
                logger.debug('Subscription card shown for user without active subscription');
                subscriptionCard.style.display = '';
            }
        }
    } catch (err) {
        logger.error('Failed to load subscription status', { error: err?.message });
        if (statusElement) {
            statusElement.innerHTML = '<div class="text-center"><small class="text-muted">Error loading</small></div>';
        }
    }
}

/**
 * Cancel subscription
 */
async function cancelSubscription() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const confirmCancel = confirm('Are you sure you want to cancel your subscription?');
    if (!confirmCancel) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/user/current/cancel`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showToast('Subscription canceled successfully', 'success');
            await loadSubscriptionStatus();
        } else {
            const data = await response.json();
            throw new Error(data.message || 'Cancel failed');
        }
    } catch (err) {
        logger.error('Failed to cancel subscription', { error: err?.message });
        alert(`Failed to cancel subscription: ${err.message}`);
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.innerHTML = `<div class="toast-body">${message}</div>`;
    container.appendChild(toast);
    new bootstrap.Toast(toast).show();
    setTimeout(() => toast.remove(), 3000);
}

// Export functions
window.cancelSubscription = cancelSubscription;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    loadSubscriptionStatus();
    updateCartCount();
});
