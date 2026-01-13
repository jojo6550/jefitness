
window.API_BASE = window.ApiConfig.getAPI_BASE();


window.initTrainerDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // Verify user is trainer
        const userRes = await fetch(`${window.API_BASE}
/api/auth/me`, {
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

        // Load dashboard data
        await loadDashboardData(token);
    } catch (err) {
        console.error('Error initializing trainer dashboard:', err);
    }
};

async function loadDashboardData(token) {
    try {
        // Fetch dashboard overview
        const dashboardRes = await fetch(`${window.API_BASE}
/api/trainer/dashboard`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!dashboardRes.ok) {
            throw new Error('Failed to load dashboard data');
        }

        const data = await dashboardRes.json();
        
        // Update overview metrics
        updateOverviewMetrics(data.overview);
        
        // Render upcoming appointments
        renderUpcomingAppointments(data.upcomingAppointments);
        
        // Calculate and display statistics
        updateStatistics(data.overview);
    } catch (err) {
        console.error('Error loading dashboard data:', err);
        showError('Failed to load dashboard data. Please refresh the page.');
    }
}

function updateOverviewMetrics(overview) {
    document.getElementById('total-clients').textContent = overview.totalClients || 0;
    document.getElementById('total-appointments').textContent = overview.totalAppointments || 0;
    document.getElementById('completed-appointments').textContent = overview.completedAppointments || 0;
    document.getElementById('completion-rate').textContent = `${overview.completionRate || 0}%`;
}

function renderUpcomingAppointments(appointments) {
    const container = document.getElementById('upcoming-appointments-container');

    if (!appointments || appointments.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-calendar-x fs-3 text-muted mb-3"></i>
                <p class="text-muted">No upcoming appointments</p>
            </div>
        `;
        return;
    }

    let html = '<div class="list-group list-group-flush">';

    appointments.forEach((apt, index) => {
        const aptDate = new Date(apt.date);
        const formattedDate = aptDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const clientName = apt.clientId
            ? `${apt.clientId.firstName} ${apt.clientId.lastName}`
            : 'Unknown Client';

        html += `
            <div class="list-group-item border-0 px-0 py-3 ${index !== appointments.length - 1 ? 'border-bottom' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 fw-bold">${clientName}</h6>
                        <p class="mb-1 small text-muted">
                            <i class="bi bi-calendar me-2"></i>${formattedDate} at ${apt.time}
                        </p>
                        ${apt.notes ? `<p class="mb-0 small text-secondary">${apt.notes}</p>` : ''}
                    </div>
                    <div class="d-flex flex-column align-items-end gap-2">
                        <span class="badge ${getStatusBadgeClass(apt.status)}">${apt.status || 'scheduled'}</span>
                        ${apt.status === 'scheduled' ? `
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-success btn-sm" onclick="updateAppointmentStatus('${apt._id}', 'completed')">Complete</button>
                                <button class="btn btn-outline-warning btn-sm" onclick="updateAppointmentStatus('${apt._id}', 'late')">Late</button>
                                <button class="btn btn-outline-danger btn-sm" onclick="updateAppointmentStatus('${apt._id}', 'no_show')">No Show</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'completed':
            return 'bg-success';
        case 'cancelled':
            return 'bg-secondary';
        case 'no_show':
            return 'bg-danger';
        case 'late':
            return 'bg-warning';
        default:
            return 'bg-primary';
    }
}

async function updateAppointmentStatus(appointmentId, status) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}
/api/appointments/${appointmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.msg || 'Failed to update appointment status');
        }

        // Reload dashboard data to reflect changes
        await loadDashboardData(token);
        showSuccess(`Appointment marked as ${status.replace('_', ' ')}`);
    } catch (err) {
        console.error('Error updating appointment status:', err);
        showError(err.message);
    }
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

function updateStatistics(overview) {
    const total = overview.totalAppointments || 1;

    // Update scheduled count
    document.getElementById('scheduled-count').textContent = overview.scheduledAppointments || 0;
    const scheduledPercentage = ((overview.scheduledAppointments || 0) / total) * 100;
    document.getElementById('scheduled-bar').style.width = `${scheduledPercentage}%`;

    // Update cancelled count
    document.getElementById('cancelled-count').textContent = overview.cancelledAppointments || 0;
    const cancelledPercentage = ((overview.cancelledAppointments || 0) / total) * 100;
    document.getElementById('cancelled-bar').style.width = `${cancelledPercentage}%`;

    // Update no show count
    document.getElementById('no-show-count').textContent = overview.noShowAppointments || 0;
    const noShowPercentage = ((overview.noShowAppointments || 0) / total) * 100;
    document.getElementById('no-show-bar').style.width = `${noShowPercentage}%`;

    // Update late count
    document.getElementById('late-count').textContent = overview.lateAppointments || 0;
    const latePercentage = ((overview.lateAppointments || 0) / total) * 100;
    document.getElementById('late-bar').style.width = `${latePercentage}%`;
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
    document.addEventListener('DOMContentLoaded', initTrainerDashboard);
} else {
    initTrainerDashboard();
}