
window.API_BASE = window.ApiConfig.getAPI_BASE();

let allAppointments = [];

window.initTrainerDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        // Initialize UI
        setupEventListeners();
        
        // Load data - Auth and role checks are now handled exclusively by the backend
        // If the user is not a trainer, the backend will return a 403, which we handle in loadAppointments
        await loadAppointments();

        // Initialize logout listener
        if (window.attachLogoutListener) {
            window.attachLogoutListener();
        }
    } catch (err) {
        console.error('Error initializing trainer dashboard:', err);
    }
};

async function loadAppointments() {
    const token = localStorage.getItem('token');
    const footerStatus = document.getElementById('footerStatus');

    try {
        const res = await fetch(`${window.API_BASE}/api/v1/trainer/appointments?limit=100`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Handle authentication and authorization errors from backend
        if (res.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }
        
        if (res.status === 403) {
            window.Toast.error('Access denied. Trainer portal only.');
            setTimeout(() => {
                // If they have a token but aren't a trainer, send them to user dashboard
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }

        if (!res.ok) throw new Error('Failed to load appointments');

        const data = await res.json();
        allAppointments = data.appointments || [];
        
        renderAppointments(allAppointments);
        if (footerStatus) footerStatus.textContent = `${allAppointments.length} sessions loaded`;

    } catch (err) {
        console.error('Error loading appointments:', err);
        window.Toast.error('Failed to load schedule.');
        if (footerStatus) footerStatus.textContent = 'Sync failed';
    }
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;
    
    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="window-loading">
                <div class="text-center opacity-50">
                    <i class="bi bi-calendar-x fs-1 mb-2 d-block"></i>
                    <span>No sessions found</span>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = appointments.map(apt => {
        const dateObj = new Date(apt.date);
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const clientName = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}` : 'Unknown Client';
        
        return `
            <div class="apt-row">
                <div class="apt-time-block">
                    <div class="apt-time">${apt.time}</div>
                    <div class="apt-date">${dateStr}</div>
                </div>
                <div class="apt-client">
                    <div class="client-name text-truncate">${clientName}</div>
                </div>
                <div class="apt-actions d-flex align-items-center gap-2">
                    <span class="apt-status status-${apt.status || 'scheduled'}">${apt.status || 'scheduled'}</span>
                    ${apt.status === 'scheduled' ? `
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-dark border-0 py-0" onclick="updateStatus('${apt._id}', 'completed')" title="Complete"><i class="bi bi-check text-success"></i></button>
                            <button class="btn btn-dark border-0 py-0" onclick="updateStatus('${apt._id}', 'late')" title="Late"><i class="bi bi-clock text-warning"></i></button>
                            <button class="btn btn-dark border-0 py-0" onclick="updateStatus('${apt._id}', 'no_show')" title="No Show"><i class="bi bi-x text-danger"></i></button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function setupEventListeners() {
    const searchInput = document.getElementById('appointmentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const filtered = allAppointments.filter(apt => {
                const name = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}`.toLowerCase() : '';
                return name.includes(term);
            });
            renderAppointments(filtered);
        });
    }

    document.getElementById('refreshAppointments')?.addEventListener('click', loadAppointments);
}

window.updateStatus = async (id, status) => {
    const statusText = status.replace('_', ' ');
    showConfirm(`Mark session as ${statusText}?`, async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${window.API_BASE}/api/v1/trainer/appointments/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });

            if (res.status === 401 || res.status === 403) {
                window.Toast.error('Session expired or unauthorized.');
                setTimeout(() => window.location.reload(), 2000);
                return;
            }

            if (!res.ok) throw new Error('Failed to update status');

            window.Toast.success(`Updated to ${statusText}`);
            await loadAppointments();
        } catch (err) {
            console.error(err);
            window.Toast.error('Update failed.');
        }
    });
};

function showConfirm(message, callback) {
    const confirmModalEl = document.getElementById('confirmModal');
    if (!confirmModalEl) {
        if (confirm(message)) callback();
        return;
    }

    const modalBody = document.getElementById('confirmModalBody');
    if (modalBody) modalBody.textContent = message;

    const confirmBtn = document.getElementById('confirmActionBtn');
    const modal = new bootstrap.Modal(confirmModalEl);

    const onConfirm = () => {
        callback();
        modal.hide();
        confirmBtn.removeEventListener('click', onConfirm);
    };

    confirmBtn.onclick = onConfirm;
    modal.show();
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrainerDashboard);
} else {
    initTrainerDashboard();
}
