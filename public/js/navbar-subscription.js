// Load subscription status for navbar
async function loadNavbarSubscriptionStatus() {
    const statusElement = document.getElementById('subscription-status-navbar');
    if (!statusElement) return;

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            statusElement.textContent = 'Not logged in';
            statusElement.className = 'badge bg-warning text-dark small';
            return;
        }

        const API_BASE = window.ApiConfig.getBaseURL();

        const response = await fetch(`${API_BASE}/api/v1/subscriptions/status`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 403) {
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
            throw new Error('Failed to fetch subscription status');
        }

        const data = await response.json();

        if (data.success && data.data) {
            const subscription = data.data;
            let statusText = 'Free';
            let statusClass = 'bg-secondary';

            if (subscription.hasSubscription) {
                if (subscription.status === 'active' || subscription.status === 'trialing') {
                    statusText = `${subscription.plan} Plan`;
                    statusClass = 'bg-success';
                } else if (subscription.status === 'canceled' || subscription.status === 'cancel_pending') {
                    statusText = `${subscription.plan} (Canceled)`;
                    statusClass = 'bg-warning text-dark';
                } else if (subscription.status === 'past_due') {
                    statusText = `${subscription.plan} (Past Due)`;
                    statusClass = 'bg-danger';
                } else {
                    statusText = `${subscription.plan} (${subscription.status})`;
                    statusClass = 'bg-info';
                }
            }

            statusElement.textContent = statusText;
            statusElement.className = `badge ${statusClass} text-white small`;
        } else {
            statusElement.textContent = 'Free';
            statusElement.className = 'badge bg-secondary text-white small';
        }
    } catch (error) {
        console.error('Error loading navbar subscription status:', error);
        statusElement.textContent = 'Error';
        statusElement.className = 'badge bg-danger text-white small';
    }
}

// Load subscription status and attach logout listener when navbar is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadNavbarSubscriptionStatus();
    attachLogoutListener();
});
