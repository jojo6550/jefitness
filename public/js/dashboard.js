
window.API_BASE = window.ApiConfig.getAPI_BASE();

window.initDashboard = async () => {
    try {
      const user = await fetch(`${window.API_BASE}/api/v1/auth/me`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

      if (!user) {
        console.warn('User data fetch failed');
        const adminLink = document.querySelector('a[href="/admin"]');
        if (adminLink) adminLink.classList.add('d-none');
        return;
      }

      // Hide Admin Dashboard link if not admin
      if (user.role !== 'admin') {
        const adminLink = document.querySelector('a[href="/admin"]');
        if (adminLink) adminLink.classList.add('d-none');
      }

      // Load subscription and workout data in parallel (independent endpoints)
      await Promise.all([loadSubscriptionStatus(), loadWorkoutStats()]);

      // Reveal real content, hide skeletons
      if (window._revealDashboard) window._revealDashboard();

    } catch (err) {
      console.error('Error verifying admin status:', err);
      const adminLink = document.querySelector('a[href="/admin"]');
      if (adminLink) adminLink.classList.add('d-none');
      // Still reveal content on error
      if (window._revealDashboard) window._revealDashboard();
    }
  };

// Load subscription status for dashboard
async function loadSubscriptionStatus() {

    const statusElement = document.getElementById('subscription-status');
    const actionsElement = document.getElementById('subscription-actions');
    const upgradeBtn = document.getElementById('upgrade-subscription-btn');

    if (!statusElement || !actionsElement || !upgradeBtn) {
        console.warn('Subscription status elements not found');
        return;
    }

    try {
        const res = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
            credentials: 'include'
        });

        if (res.ok) {
            const data = await res.json();
            const subscription = data.data;

            // Update status display
            let statusText = '';
            let statusClass = '';

            if (subscription && subscription.status === 'active') {
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
            if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
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

    try {
        // Get current subscription to find the subscription ID
        const currentRes = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
            credentials: 'include'
        });

        if (!currentRes.ok) {
            throw new Error('Failed to get current subscription');
        }

        const currentData = await currentRes.json();
        const subscription = currentData.data;

        if (!subscription || !subscription._id) {
            throw new Error('No active subscription found');
        }

        // Cancel the subscription — POST /cancel/:mongoId (not Stripe ID)
        const cancelRes = await fetch(`${window.API_BASE}/api/v1/subscriptions/cancel/${subscription._id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
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
    try {
        const res = await fetch(`${window.API_BASE}/api/v1/workouts/stats/summary`, {
            credentials: 'include'
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

