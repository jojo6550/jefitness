/**
 * Appointments Management
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load appointments for current user
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
        showError('Failed to load appointments. Please try again.');
    }
}

/**
 * Render appointments list
 */
function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    if (appointments.length === 0) {
        container.innerHTML = '<p class="text-muted">No appointments scheduled.</p>';
        return;
    }

    container.innerHTML = appointments.map(apt => `
        <div class="appointment-card p-3 border rounded mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6>${new Date(apt.date).toLocaleDateString()} at ${apt.time}</h6>
                    <small class="text-muted">${apt.trainerName || 'Trainer'}</small>
                </div>
                <div>
                    <span class="badge ${apt.status === 'scheduled' ? 'bg-primary' : apt.status === 'completed' ? 'bg-success' : 'bg-danger'}">
                        ${apt.status}
                    </span>
                    <button class="btn btn-sm btn-outline-primary ms-2" onclick="viewAppointment('${apt._id}')">
                        View
                    </button>
                </div>
        </div>
    `).join('');
}

/**
 * View appointment details
 */
async function viewAppointment(appointmentId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/appointments/${appointmentId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load appointment details');
        }

        const appointment = await response.json();
        
        // Show in modal
        const modal = document.getElementById('appointmentModal');
        const content = document.getElementById('appointmentContent');
        
        if (modal && content) {
            content.innerHTML = `
                <h5>${new Date(appointment.date).toLocaleDateString()} at ${appointment.time}</h5>
                <p><strong>Trainer:</strong> ${appointment.trainerName || 'N/A'}</p>
                <p><strong>Status:</strong> ${appointment.status}</p>
                <p><strong>Notes:</strong> ${appointment.notes || 'No notes'}</p>
            `;
            new bootstrap.Modal(modal).show();
        }
    } catch (err) {
        logger.error('Failed to view appointment', { error: err?.message });
        alert('Failed to load appointment details.');
    }
}

/**
 * Load available trainers
 */
async function loadTrainers() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/users/trainers`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load trainers');
        }

        const data = await response.json();
        renderTrainerSelect(data.data || []);
    } catch (err) {
        logger.error('Failed to load trainers', { error: err?.message });
    }
}

/**
 * Render trainer selection dropdown
 */
function renderTrainerSelect(trainers) {
    const select = document.getElementById('appointmentTrainer');
    if (!select) return;

    select.innerHTML = `
        <option value="">Select a trainer</option>
        ${trainers.map(t => `<option value="${t._id}">${t.firstName} ${t.lastName}</option>`).join('')}
    `;
}

/**
 * Create new appointment
 */
async function createAppointment(data) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/appointments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Failed to create appointment');
        }

        showToast('Appointment scheduled successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('createAppointmentModal')).hide();
        await loadAppointments();
    } catch (err) {
        logger.error('Failed to create appointment', { error: err?.message });
        alert('Failed to create appointment.');
    }
}

/**
 * Update appointment
 */
async function updateAppointment(appointmentId, data) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/appointments/${appointmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Failed to update appointment');
        }

        showToast('Appointment updated', 'success');
        bootstrap.Modal.getInstance(document.getElementById('editAppointmentModal')).hide();
        await loadAppointments();
    } catch (err) {
        logger.error('Failed to update appointment', { error: err?.message });
        alert('Failed to update appointment.');
    }
}

/**
 * Delete appointment
 */
async function deleteAppointment(appointmentId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to delete appointment');
        }

        showToast('Appointment cancelled', 'success');
        await loadAppointments();
    } catch (err) {
        logger.error('Failed to delete appointment', { error: err?.message });
        alert('Failed to delete appointment.');
    }
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
window.viewAppointment = viewAppointment;
window.createAppointment = createAppointment;
window.updateAppointment = updateAppointment;
window.deleteAppointment = deleteAppointment;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAppointments();
    loadTrainers();

    // Setup create form
    const createForm = document.getElementById('createAppointmentForm');
    if (createForm) {
        createForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(createForm);
            createAppointment(Object.fromEntries(formData));
        });
    }
});
