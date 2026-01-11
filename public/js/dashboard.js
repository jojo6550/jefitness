
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

window.initDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return; // not logged in

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn('User data fetch failed');
        const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
        if (adminLink) adminLink.style.display = 'none';
        return;
      }

      const user = await res.json();

      // Hide Admin Dashboard link if not admin
      if (user.role !== 'admin') {
        const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
        if (adminLink) adminLink.style.display = 'none';
      }

      // Load cart count
      loadCartCount();

      // Load subscription status
      loadSubscriptionStatus();
    } catch (err) {
      console.error('Error verifying admin status:', err);
      const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
      if (adminLink) adminLink.style.display = 'none';
    }
  };

// Load cart count for dashboard
async function loadCartCount() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const cart = await res.json();
            const count = cart.items ? cart.items.length : 0;

            const dashboardCartCount = document.getElementById('dashboard-cart-count');
            if (dashboardCartCount) {
                dashboardCartCount.textContent = count;
            }

            // Update navbar badge
            const navbarBadge = document.querySelector('.cart-badge');
            if (navbarBadge) {
                navbarBadge.textContent = count;
                navbarBadge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (err) {
        console.error('Error loading cart count:', err);
    }
}

// Load subscription status for dashboard
async function loadSubscriptionStatus() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const statusElement = document.getElementById('subscription-status');
    const actionsElement = document.getElementById('subscription-actions');
    const upgradeBtn = document.getElementById('upgrade-subscription-btn');

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/subscriptions/user/current`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            const subscription = data.data;

            // Update status display
            let statusText = '';
            let statusClass = '';

            if (subscription.hasSubscription && subscription.status === 'active') {
                statusText = `Active: ${subscription.plan}`;
                statusClass = 'text-success';
            } else if (subscription.status === 'canceled' || subscription.status === 'cancel_pending') {
                statusText = `Canceled: ${subscription.plan}`;
                statusClass = 'text-warning';
            } else {
                statusText = 'Free Tier';
                statusClass = 'text-muted';
            }

            statusElement.innerHTML = `<div class="text-center"><small class="${statusClass}">${statusText}</small></div>`;

            // Show actions
            actionsElement.classList.remove('d-none');

            // Show upgrade button if not active subscription
            if (!subscription.hasSubscription || subscription.status !== 'active') {
                upgradeBtn.classList.remove('d-none');
            } else {
                upgradeBtn.classList.add('d-none');
            }
        } else {
            statusElement.innerHTML = '<div class="text-center"><small class="text-muted">Unable to load</small></div>';
        }
    } catch (err) {
        console.error('Error loading subscription status:', err);
        statusElement.innerHTML = '<div class="text-center"><small class="text-muted">Error loading</small></div>';
    }
}

// Event listener for upgrade subscription button
document.getElementById('upgrade-subscription-btn').addEventListener('click', () => {
    window.location.href = 'subscriptions.html';
});

