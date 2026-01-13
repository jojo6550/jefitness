
const API_BASE = window.ApiConfig.getBaseURL();

let currentPage = 1;
const pageSize = 10;
let selectedAppointmentId = null;

window.initTrainerAppointments = async () => {
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
        document.getElementById('filter-btn').addEventListener('click', handleFilter);
        document.getElementById('search-appointments').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleFilter();
        });

        // Load initial appointments
        await loadAppointments(token);
    } catch (err) {
        console.error('Error initializing trainer appointments:', err);
    }
};

async function loadAppointments(token, page = 1, search = '', status = '') {
    try {
        const queryParams = new URLSearchParams({
            page,
            limit: pageSize,
            ...(search && { search }),
            ...(status && { status })
        });

        const res = await fetch(`${API_BASE}/api/trainer/appointments?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            throw new Error('Failed to load appointments');
        }

        const data = await res.json();
        renderAppointmentsTable(data.appointments);
        renderPagination(data.pagination);
        currentPage = page;
    } catch (err) {
        console.error('Error loading appointments:', err);
        showError('Failed to load appointments. Please try again.');
    }
}

function renderAppointmentsTable(appointments) {
    const tbody = document.getElementById('appointments-tbody');
    
    if (!appointments || appointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <i class="bi bi-calendar-x fs-3 text-muted d-block mb-2"></i>
                    <p class="text-muted">No appointments found</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    appointments.forEach(apt => {
        const aptDate = new Date(apt.date);
        const formattedDate = aptDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
        
        const clientName = apt.clientId 
            ? `${apt.clientId.firstName} ${apt.clientId.lastName}` 
            : 'Unknown Client';

        const statusBadgeClass = {
            'scheduled': 'bg-info',
            'completed': 'bg-success',
            'cancelled': 'bg-danger'
        }[apt.status] || 'bg-secondary';

        html += `
            <tr>
                <td class="fw-bold">${clientName}</td>
                <td>${formattedDate}</td>
                <td>${apt.time}</td>
                <td>
                    <span class="badge ${statusBadgeClass}">${apt.status || 'Unknown'}</span>
                </td>
                <td class="text-muted small">${apt.notes || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editAppointment('${apt._id}', '${apt.status}', '${apt.notes || ''}')">
                        <i class="bi bi-pencil me-1"></i> Edit
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

async function handleFilter() {
    const token = localStorage.getItem('token');
    const search = document.getElementById('search-appointments').value;
    const status = document.getElementById('status-filter').value;
    await loadAppointments(token, 1, search, status);
}

async function goToPage(page) {
    const token = localStorage.getItem('token');
    const search = document.getElementById('search-appointments').value;
    const status = document.getElementById('status-filter').value;
    await loadAppointments(token, page, search, status);
}

function editAppointment(appointmentId, currentStatus, currentNotes) {
    selectedAppointmentId = appointmentId;
    document.getElementById('appointmentStatus').value = currentStatus;
    document.getElementById('appointmentNotes').value = currentNotes;
    
    const modal = new bootstrap.Modal(document.getElementById('updateStatusModal'));
    modal.show();
}

async function saveAppointmentStatus() {
    const token = localStorage.getItem('token');
    const status = document.getElementById('appointmentStatus').value;
    const notes = document.getElementById('appointmentNotes').value;

    if (!selectedAppointmentId) {
        showError('No appointment selected');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/trainer/appointments/${selectedAppointmentId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes })
        });

        if (!res.ok) {
            throw new Error('Failed to update appointment');
        }

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('updateStatusModal'));
        modal.hide();

        // Reload appointments
        await loadAppointments(token, currentPage);
        showSuccess('Appointment updated successfully');
    } catch (err) {
        console.error('Error saving appointment:', err);
        showError('Failed to update appointment. Please try again.');
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

function showSuccess(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
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
    document.addEventListener('DOMContentLoaded', initTrainerAppointments);
} else {
    initTrainerAppointments();
}