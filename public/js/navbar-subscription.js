// Load subscription status for navbar
async function loadNavbarSubscriptionStatus() {
    const statusElement = document.getElementById('subscription-status-navbar');
    if (!statusElement) return;

    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
        window.API_BASE = window.ApiConfig.getAPI_BASE();

        if (isDevelopment) console.log('Fetching subscription status from:', `${window.API_BASE}/api/v1/subscriptions/current`);

        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
            credentials: 'include'
        });

        if (response.status === 401 || response.status === 403) {
            statusElement.textContent = 'Not logged in';
            statusElement.className = 'badge bg-warning text-dark small';
            return;
        }
        if (!response.ok) {
            throw new Error(`Failed to fetch subscription status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (isDevelopment) console.log('Subscription data:', data);

        if (data.success && data.data) {
            const subscription = data.data;
            let statusText = 'Free';
            let statusClass = 'bg-secondary';

            // 3-state model: active, trialing, cancelled
                const { status, plan, cancelAtPeriodEnd, daysLeft } = subscription || {};
                const safePlan = plan || 'Custom Plan';
            if (status === 'active') {
                const dayText = daysLeft === 1 ? 'day' : 'days';
                const suffix = daysLeft ? ` (${daysLeft} ${dayText})` : '';
                statusText = cancelAtPeriodEnd ? `${safePlan} (Canceling)${suffix}` : `${safePlan} Plan${suffix}`;
                statusClass = cancelAtPeriodEnd ? 'bg-warning text-dark' : 'bg-success';
            } else if (status === 'trialing') {
                statusText = 'Pending';
                statusClass = 'bg-info';
            } else if (status === 'cancelled') {
                statusText = 'No Subscription';
                statusClass = 'bg-secondary';
            }

            statusElement.textContent = statusText;
            statusElement.className = `badge ${statusClass} text-white small`;
        } else {
            statusElement.textContent = 'Free';
            statusElement.className = 'badge bg-secondary text-white small';
        }
    } catch (error) {
        if (isDevelopment) console.error('Error loading navbar subscription status:', error);
        statusElement.textContent = 'Subscription Required';
        statusElement.className = 'badge bg-warning text-dark small';
    }
}

// Load subscription status and attach logout listener when navbar is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadNavbarSubscriptionStatus();
    attachLogoutListener();
});
