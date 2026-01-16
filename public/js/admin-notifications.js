/**
 * Admin Notifications Management
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load notifications
 */
async function loadNotifications() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/notifications`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load notifications');
        }

        const data = await response.json();
        renderNotifications(data.notifications || []);
    } catch (err) {
        logger.error('Failed to load notifications', { error: err?.message });
    }
}

/**
 * Render notifications list
 */
function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = '<p class="text-muted">No notifications.</p>';
        return;
    }

    container.innerHTML = notifications.map(n => `
        <div class="notification-item p-3 border-bottom">
            <div class="d-flex justify-content-between">
                <strong>${n.title}</strong>
                <small class="text-muted">${new Date(n.createdAt).toLocaleDateString()}</small>
            </div>
            <p class="mb-0">${n.message}</p>
            ${!n.read ? '<span class="badge bg-primary">New</span>' : ''}
        </div>
    `).join('');
}

/**
 * Send notification to user
 */
async function sendNotification(userId, title, message) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/notifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ userId, title, message })
        });

        if (response.ok) {
            showToast('Notification sent', 'success');
            loadNotifications();
        } else {
            const data = await response.json();
            throw new Error(data.message || 'Failed to send notification');
        }
    } catch (err) {
        logger.error('Failed to send notification', { error: err?.message });
        alert('Error sending notification. Please try again.');
    }
}

/**
 * Load users for notification recipient selection
 */
async function loadUsers() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const data = await response.json();
        renderUserSelect(data.users || []);
    } catch (err) {
        logger.error('Failed to load users', { error: err?.message });
    }
}

/**
 * Render user selection dropdown
 */
function renderUserSelect(users) {
    const select = document.getElementById('notificationUser');
    if (!select) return;

    select.innerHTML = `
        <option value="">All Users</option>
        ${users.map(u => `<option value="${u._id}">${u.firstName} ${u.lastName}</option>`).join('')}
    `;
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
window.sendNotification = sendNotification;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNotifications();
    loadUsers();

    // Setup send form
    const form = document.getElementById('sendNotificationForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('notificationUser').value;
            const title = document.getElementById('notificationTitle').value;
            const message = document.getElementById('notificationMessage').value;

            await sendNotification(userId, title, message);
            form.reset();
        });
    }
});
