/**
 * Navbar Subscription Status
 * Shows subscription status in the navigation bar
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load and display subscription status in navbar
 */
async function loadNavbarSubscriptionStatus() {
    const token = localStorage.getItem('token');
    const statusElement = document.getElementById('subscriptionStatus');
    
    if (!token || !statusElement) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/user/current`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load subscription');
        }

        const data = await response.json();
        const subscription = data.data;

        if (subscription?.hasActiveSubscription) {
            statusElement.innerHTML = `<span class="badge bg-success">Active</span>`;
        } else {
            statusElement.innerHTML = `<span class="badge bg-warning text-dark">No Subscription</span>`;
        }
    } catch (err) {
        logger.error('Failed to load navbar subscription status', { error: err?.message });
        statusElement.textContent = 'Subscription Required';
    }
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    // Only run if element exists
    const statusElement = document.getElementById('subscriptionStatus');
    if (statusElement) {
        loadNavbarSubscriptionStatus();
    }
});
