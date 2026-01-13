

const API_BASE = window.ApiConfig.getAPI_BASE();

window.initDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return; // not logged in

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
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

      // Load subscription status
      await loadSubscriptionStatus();

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
        const res = await fetch(`${API_BASE}/api/cart`, {
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

    if (!statusElement || !actionsElement || !upgradeBtn) {
        console.warn('Subscription status elements not found');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/v1/subscriptions/user/current`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            const subscription = data.data;

            console.log('Subscription data:', subscription); // Debug log

            // Update status display
            let statusText = '';
            let statusClass = '';

            if (subscription.hasSubscription && subscription.status === 'active') {
                // Display "Active Plan: X Months"
                const planDisplay = subscription.plan.replace('-', ' ').toUpperCase();
                statusText = `Active Plan: ${planDisplay}`;
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

            // Show appropriate buttons based on subscription status
            console.log('Checking button visibility:', {
                hasSubscription: subscription.hasSubscription,
                status: subscription.status,
                condition: subscription.hasSubscription && subscription.status === 'active'
            }); // Debug log

            if (subscription.hasSubscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
                // Show cancel button for active subscriptions
                console.log('Showing cancel button'); // Debug log
                document.getElementById('cancel-subscription-btn').classList.remove('d-none');
                upgradeBtn.classList.add('d-none');

                // Hide subscription card for users with active subscription
                const subscriptionCard = document.getElementById('subscription-card');
                if (subscriptionCard) {
                    subscriptionCard.style.display = 'none';
                    console.log('Subscription card hidden for user with active/trialing subscription');
                }
            } else {
                // Show upgrade button for non-active subscriptions
                console.log('Showing upgrade button'); // Debug log
                document.getElementById('cancel-subscription-btn').classList.add('d-none');
                upgradeBtn.classList.remove('d-none');

                // Show subscription card for users without active subscription
                const subscriptionCard = document.getElementById('subscription-card');
                if (subscriptionCard) {
                    subscriptionCard.style.display = '';
                    console.log('Subscription card shown for user without active subscription');
                }
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
    window.location.href = '../subscriptions.html';
});

// Event listener for cancel subscription button
document.getElementById('cancel-subscription-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will be moved to the free tier.')) {
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please log in to cancel your subscription.');
        return;
    }

    try {
        // Get current subscription to find the subscription ID
        const currentRes = await fetch(`${API_BASE}/api/v1/subscriptions/user/current`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!currentRes.ok) {
            throw new Error('Failed to get current subscription');
        }

        const currentData = await currentRes.json();
        const subscription = currentData.data;

        if (!subscription || !subscription.id) {
            throw new Error('No active subscription found');
        }

        // Cancel the subscription
        const cancelRes = await fetch(`${API_BASE}/api/v1/subscriptions/${subscription.stripeSubscriptionId}/cancel`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                atPeriodEnd: false // Immediate cancellation
            })
        });

        const cancelData = await cancelRes.json();

        if (cancelData.success) {
            alert('✅ Subscription has been canceled immediately. You are now on the free tier.');
            // Reload subscription status
            await loadSubscriptionStatus();
        } else {
            throw new Error(cancelData.error?.message || 'Failed to cancel subscription');
        }

    } catch (error) {
        console.error('❌ Error canceling subscription:', error);
        alert(`Failed to cancel subscription: ${error.message}`);
    }
});

