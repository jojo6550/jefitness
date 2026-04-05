

// Handle token passed via URL after Google OAuth redirect
(function () {
  const params = new URLSearchParams(window.location.search);
  const oauthToken = params.get('token');
  if (oauthToken) {
    localStorage.setItem('token', oauthToken);
    // Clean the token from the URL without reloading
    const cleanUrl = window.location.pathname + (params.toString().replace(/token=[^&]*&?/, '').replace(/^&/, '') ? '?' + params.toString().replace(/token=[^&]*&?/, '').replace(/^&/, '') : '');
    window.history.replaceState({}, '', cleanUrl);
  }
})();

window.API_BASE = window.ApiConfig.getAPI_BASE();

window.initDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return; // not logged in

    try {
      const res = await fetch(`${window.API_BASE}/api/v1/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn('User data fetch failed');
        const adminLink = document.querySelector('a[href="/admin-dashboard"]');
        if (adminLink) adminLink.classList.add('d-none');
        return;
      }

      const user = await res.json();

      // Hide Admin Dashboard link if not admin
      if (user.role !== 'admin') {
        const adminLink = document.querySelector('a[href="/admin-dashboard"]');
        if (adminLink) adminLink.classList.add('d-none');
      }

      // Load subscription status
      await loadSubscriptionStatus();

      // Load workout statistics
      await loadWorkoutStats();

      // Reveal real content, hide skeletons
      if (window._revealDashboard) window._revealDashboard();

    } catch (err) {
      console.error('Error verifying admin status:', err);
      const adminLink = document.querySelector('a[href="/admin-dashboard"]');
      if (adminLink) adminLink.classList.add('d-none');
      // Still reveal content on error
      if (window._revealDashboard) window._revealDashboard();
    }
  };

// Load cart count for dashboard
async function loadCartCount() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch(`${window.API_BASE}
/api/cart`, {
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
                navbarBadge.classList.toggle('d-none', count === 0);
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
        const res = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
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
            if (subscription.hasSubscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
                document.getElementById('cancel-subscription-btn').classList.remove('d-none');
                upgradeBtn.classList.add('d-none');
                document.getElementById('subscription-card')?.classList.add('d-none');
            } else {
                document.getElementById('cancel-subscription-btn').classList.add('d-none');
                upgradeBtn.classList.remove('d-none');
                document.getElementById('subscription-card')?.classList.remove('d-none');
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
    window.location.href = '/subscriptions';
});

// Event listener for cancel subscription button
document.getElementById('cancel-subscription-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will be moved to the free tier.')) {
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.Toast.error('Please log in to cancel your subscription.');
        return;
    }

    try {
        // Get current subscription to find the subscription ID
        const currentRes = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
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
        const cancelRes = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subscription.stripeSubscriptionId}/cancel`, {
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
            window.Toast.success('Subscription canceled. You are now on the free tier.');
            // Reload subscription status
            await loadSubscriptionStatus();
        } else {
            throw new Error(cancelData.error?.message || 'Failed to cancel subscription');
        }

    } catch (error) {
        console.error('❌ Error canceling subscription:', error);
        window.Toast.error(`Failed to cancel subscription: ${error.message}`);
    }
});

// Load workout statistics
async function loadWorkoutStats() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch(`${window.API_BASE}/api/v1/workouts/stats/summary`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const result = await res.json();
            const stats = result.stats;

            if (stats.totalWorkouts > 0) {
                // Show stats section
                document.getElementById('workoutStatsSection').classList.remove('d-none');

                // Update stat cards
                document.getElementById('statTotalWorkouts').textContent = stats.totalWorkouts;
                document.getElementById('statWeeklyVolume').textContent = stats.weeklyVolume.toLocaleString();
                document.getElementById('statMostTrained').textContent = stats.mostTrainedExercise || 'None';

                if (stats.lastWorkout) {
                    document.getElementById('statLastWorkout').textContent = stats.lastWorkout.workoutName;
                    const lastDate = new Date(stats.lastWorkout.date).toLocaleDateString();
                    document.getElementById('statLastWorkoutDate').textContent = lastDate;
                }
            }
        }
    } catch (err) {
        console.error('Error loading workout stats:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.initDashboard) window.initDashboard();
});

