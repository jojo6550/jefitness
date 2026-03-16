// Load subscription status for navbar
async function loadNavbarSubscriptionStatus() {
    const statusElement = document.getElementById('subscription-status-navbar');
    if (!statusElement) return;

    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            statusElement.textContent = 'Not logged in';
            statusElement.className = 'badge bg-warning text-dark small';
            return;
        }

        window.API_BASE = window.ApiConfig.getAPI_BASE();

        if (isDevelopment) console.log('Fetching subscription status from:', `${window.API_BASE}/api/v1/subscriptions/current`);

        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            // Clear invalid token
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            localStorage.removeItem('userId');
            sessionStorage.removeItem('userId');
            localStorage.removeItem('userRole');
            sessionStorage.removeItem('userRole');
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

            // API returns raw DB doc — use status directly (no hasSubscription/isActive flags)
            const { status, plan } = subscription;
            if (status === 'active' || status === 'trialing') {
                statusText = `${plan} Plan`;
                statusClass = 'bg-success';
            } else if (status === 'canceled' || status === 'cancel_pending') {
                statusText = `${plan} (Canceled)`;
                statusClass = 'bg-warning text-dark';
            } else if (status === 'past_due') {
                statusText = `${plan} (Past Due)`;
                statusClass = 'bg-danger';
            } else if (status) {
                statusText = `${plan} (${status})`;
                statusClass = 'bg-info';
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
