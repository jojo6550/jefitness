const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

window.initTrainerDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // Verify user is trainer
        const userRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
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
        const dashboardRes = await fetch(`${API_BASE_URL}/api/trainer/dashboard`, {
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
                    <span class="badge bg-success">${apt.status || 'scheduled'}</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
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