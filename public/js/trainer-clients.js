const API_BASE = window.ApiConfig.getAPI_BASE();


let currentPage = 1;
const pageSize = 10;

window.initTrainerClients = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // Verify user is trainer
        const userRes = await fetch(`${API_BASE}/api/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!userRes.ok) {
            console.warn('User verification failed');
            return;
        }

        const user = await userRes.json();
        if (user.role !== 'trainer') {
            console.warn('User is not a trainer');
            return;
        }

        // Set up event listeners
        document.getElementById('search-btn').addEventListener('click', handleSearch);
        document.getElementById('search-clients').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Load initial clients
        await loadClients(token);
    } catch (err) {
        console.error('Error initializing trainer clients:', err);
    }
};

async function loadClients(token, page = 1, search = '') {
    try {
        const queryParams = new URLSearchParams({
            page,
            limit: pageSize,
            ...(search && { search })
        });

        const res = await fetch(`${API_BASE}/api/trainer/clients?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            throw new Error('Failed to load clients');
        }

        const data = await res.json();
        renderClientsTable(data.clients);
        renderPagination(data.pagination);
        currentPage = page;
    } catch (err) {
        console.error('Error loading clients:', err);
        showError('Failed to load clients. Please try again.');
    }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clients-tbody');
    
    if (!clients || clients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5">
                    <i class="bi bi-inbox fs-3 text-muted d-block mb-2"></i>
                    <p class="text-muted">No clients found</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    clients.forEach(client => {
        const statusBadgeClass = {
            'active': 'bg-success',
            'inactive': 'bg-secondary',
            'on-break': 'bg-warning'
        }[client.activityStatus] || 'bg-secondary';

        html += `
            <tr>
                <td class="fw-bold">${client.firstName} ${client.lastName}</td>
                <td>${client.email}</td>
                <td>
                    <span class="badge ${statusBadgeClass}">${client.activityStatus || 'Unknown'}</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewClientDetails('${client._id}')">
                        <i class="bi bi-eye me-1"></i> View
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderPagination(pagination) {
    const nav = document.getElementById('pagination-nav');
    
    if (pagination.totalPages <= 1) {
        nav.innerHTML = '';
        return;
    }

    let html = '<ul class="pagination mb-0 justify-content-center">';

    // Previous button
    html += `
        <li class="page-item ${pagination.hasPrev ? '' : 'disabled'}">
            <button class="page-link" ${pagination.hasPrev ? `onclick="goToPage(${pagination.currentPage - 1})"` : 'disabled'}>
                Previous
            </button>
        </li>
    `;

    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        html += `
            <li class="page-item ${i === pagination.currentPage ? 'active' : ''}">
                <button class="page-link" onclick="goToPage(${i})">${i}</button>
            </li>
        `;
    }

    // Next button
    html += `
        <li class="page-item ${pagination.hasNext ? '' : 'disabled'}">
            <button class="page-link" ${pagination.hasNext ? `onclick="goToPage(${pagination.currentPage + 1})"` : 'disabled'}>
                Next
            </button>
        </li>
    `;

    html += '</ul>';
    nav.innerHTML = html;
}

async function handleSearch() {
    const token = localStorage.getItem('token');
    const search = document.getElementById('search-clients').value;
    await loadClients(token, 1, search);
}

async function goToPage(page) {
    const token = localStorage.getItem('token');
    const search = document.getElementById('search-clients').value;
    await loadClients(token, page, search);
}

function viewClientDetails(clientId) {
    // Navigate to client details page
    if (window.router) {
        window.router.navigate(`/client/${clientId}`);
    }
}

function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alertDiv);
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrainerClients);
} else {
    initTrainerClients();
}