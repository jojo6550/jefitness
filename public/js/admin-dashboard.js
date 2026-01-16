/**
 * Admin Dashboard
 * Handles admin-specific functionality and data display
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Initialize admin dashboard
 */
async function initAdminDashboard() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'pages/login.html';
        return;
    }

    await loadDashboardData();
}

/**
 * Load all dashboard data
 */
async function loadDashboardData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        await Promise.all([
            loadClients(),
            loadStatistics(),
            loadAppointments(),
            loadOrders()
        ]);
    } catch (err) {
        logger.error('Failed to load dashboard data', { error: err?.message });
    }
}

/**
 * Load clients list
 */
async function loadClients() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load clients');
        }

        const data = await response.json();
        renderClients(data.data || []);
    } catch (err) {
        logger.error('Failed to load clients', { error: err?.message });
        showError('Failed to load clients. Please try again.');
    }
}

/**
 * Render clients table
 */
function renderClients(clients) {
    const container = document.getElementById('clientsTableBody');
    if (!container) return;

    if (clients.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center">No clients found</td></tr>';
        return;
    }

    container.innerHTML = clients.map(client => `
        <tr>
            <td>${client.firstName} ${client.lastName}</td>
            <td>${client.email}</td>
            <td><span class="badge ${client.role === 'admin' ? 'bg-danger' : client.role === 'trainer' ? 'bg-warning' : 'bg-primary'}">${client.role}</span></td>
            <td>${client.subscriptionStatus || 'N/A'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewClientDetails('${client._id}')">View</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteClient('${client._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

/**
 * View client details
 */
async function viewClientDetails(clientId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/users/${clientId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load user details');
        }

        const user = await response.json();
        
        // Show in modal
        const modal = document.getElementById('clientDetailsModal');
        const content = document.getElementById('clientDetailsContent');
        
        if (modal && content) {
            content.innerHTML = `
                <h5>${user.firstName} ${user.lastName}</h5>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Role:</strong> ${user.role}</p>
                <p><strong>Subscription:</strong> ${user.subscriptionStatus || 'None'}</p>
                <p><strong>Created:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
            `;
            new bootstrap.Modal(modal).show();
        }
    } catch (err) {
        logger.error('Failed to load user details', { error: err?.message });
    }
}

/**
 * Delete client
 */
async function deleteClient(clientId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/users/${clientId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to delete client');
        }

        showToast('User deleted successfully', 'success');
        await loadClients();
    } catch (err) {
        logger.error('Failed to delete client', { error: err?.message });
        alert('Failed to delete client. Please try again.');
    }
}

/**
 * Load statistics
 */
async function loadStatistics() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/admin/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load statistics');
        }

        const stats = await response.json();
        renderStatistics(stats);
    } catch (err) {
        logger.error('Failed to load statistics', { error: err?.message });
    }
}

/**
 * Render statistics
 */
function renderStatistics(stats) {
    const totalUsers = document.getElementById('totalUsers');
    const activeSubscriptions = document.getElementById('activeSubscriptions');
    const revenue = document.getElementById('revenue');

    if (totalUsers) totalUsers.textContent = stats.totalUsers || 0;
    if (activeSubscriptions) activeSubscriptions.textContent = stats.activeSubscriptions || 0;
    if (revenue) revenue.textContent = `$${(stats.revenue || 0).toFixed(2)}`;
}

/**
 * Load appointments
 */
async function loadAppointments() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/appointments`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load appointments');
        }

        const data = await response.json();
        renderAppointments(data.data || []);
    } catch (err) {
        logger.error('Failed to load appointments', { error: err?.message });
        showAppointmentsError('Failed to load appointments. Please try again.');
    }
}

/**
 * Render appointments
 */
function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    container.innerHTML = appointments.map(apt => `
        <div class="appointment-card p-3 border rounded mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6>${new Date(apt.date).toLocaleDateString()} at ${apt.time}</h6>
                    <small class="text-muted">${apt.userName || 'User'}</small>
                </div>
                <div>
                    <span class="badge ${apt.status === 'scheduled' ? 'bg-primary' : apt.status === 'completed' ? 'bg-success' : 'bg-warning'}">
                        ${apt.status}
                    </span>
                </div>
        </div>
    `).join('');
}

/**
 * Load orders
 */
async function loadOrders() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/orders`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load orders');
        }

        const data = await response.json();
        renderOrders(data.data || []);
    } catch (err) {
        logger.error('Failed to load orders', { error: err?.message });
        showOrdersError('Failed to load orders. Please try again.');
    }
}

/**
 * Render orders
 */
function renderOrders(orders) {
    const container = document.getElementById('ordersList');
    if (!container) return;

    container.innerHTML = orders.map(order => `
        <div class="order-card p-3 border rounded mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6>Order #${order._id.substring(0, 8)}</h6>
                    <small class="text-muted">${new Date(order.createdAt).toLocaleDateString()}</small>
                </div>
                <div>
                    <span class="badge ${order.status === 'completed' ? 'bg-success' : order.status === 'pending' ? 'bg-warning' : 'bg-secondary'}">
                        ${order.status}
                    </span>
                    <span class="ms-2">$${(order.amount / 100).toFixed(2)}</span>
                </div>
        </div>
    `).join('');
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('errorContainer');
    if (container) {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
        setTimeout(() => container.innerHTML = '', 5000);
    }
}

/**
 * Show appointments error
 */
function showAppointmentsError(message) {
    const container = document.getElementById('appointmentsError');
    if (container) {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
    }
}

/**
 * Show orders error
 */
function showOrdersError(message) {
    const container = document.getElementById('ordersError');
    if (container) {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
    }
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

// Export functions globally
window.viewClientDetails = viewClientDetails;
window.deleteClient = deleteClient;

// Initialize
document.addEventListener('DOMContentLoaded', initAdminDashboard);
