async function loadNavbarSubscriptionStatus() {
    const statusElement = document.getElementById('subscription-status-navbar');
    if (!statusElement) return;

    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
        window.API_BASE = window.ApiConfig.getAPI_BASE();
        const response = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, { credentials: 'include' });

        if (response.status === 401 || response.status === 403) {
            statusElement.textContent = 'Not logged in';
            statusElement.className = 'badge bg-warning text-dark small';
            return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success && data.data) {
            const { active, daysLeft } = data.data;
            if (active && daysLeft > 0) {
                const dayText = daysLeft === 1 ? 'day' : 'days';
                statusElement.textContent = `Active (${daysLeft} ${dayText})`;
                statusElement.className = 'badge bg-success text-white small';
            } else if (active) {
                statusElement.textContent = 'Expired';
                statusElement.className = 'badge bg-warning text-dark small';
            } else {
                statusElement.textContent = 'No Plan';
                statusElement.className = 'badge bg-secondary text-white small';
            }
        } else {
            statusElement.textContent = 'Free';
            statusElement.className = 'badge bg-secondary text-white small';
        }
    } catch (error) {
        if (isDevelopment) console.error('Navbar subscription error:', error);
        statusElement.textContent = 'Free';
        statusElement.className = 'badge bg-secondary text-white small';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadNavbarSubscriptionStatus();
    attachLogoutListener();
});
