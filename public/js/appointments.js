// public/js/appointments.js

window.API_BASE = window.ApiConfig.getAPI_BASE();

// ====== State ======
let currentViewAppointmentId = null;
let currentEditAppointmentId = null;
let userSubscriptionStatus = false;

// ====== Helper: Fetch with Auth ======
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('No auth token found');

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
    return res.json();
}

// ====== Subscription Check ======
async function checkSubscriptionStatus() {
    try {
        const data = await authFetch(`${window.API_BASE}/api/v1/subscriptions/user/current`);
        const sub = data.data;

        if (!sub) {
            userSubscriptionStatus = false;
            return false;
        }

        // Compute active status based on schema
        const isActive = sub.status === 'active';
        const isPeriodValid = !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date();

        userSubscriptionStatus = isActive && isPeriodValid;

        console.log('Subscription check:', {
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
            userSubscriptionStatus
        });

        return userSubscriptionStatus;
    } catch (err) {
        console.error('Error checking subscription:', err);
        userSubscriptionStatus = false;
        return false;
    }
}

// ====== Load Appointments ======
async function loadAppointments() {
    if (!userSubscriptionStatus) {
        showError('You need an active subscription to view appointments.');
        return;
    }

    try {
        const data = await authFetch(`${window.API_BASE}/api/appointments/user`);
        const appointments = data.appointments;
        displayAppointments(appointments);
    } catch (err) {
        console.error('Error loading appointments:', err);
        showError('Failed to load appointments. Please try again.');
    }
}

// ====== Display Appointments ======
function displayAppointments(appointments) {
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = '';

    const activeAppointments = appointments.filter(app => app.status !== 'cancelled');
    if (activeAppointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5">
                    <div class="mb-3">
                        <i class="bi bi-calendar-x text-muted" style="font-size: 3rem;"></i>
                    </div>
                    <h5 class="text-muted">No upcoming appointments</h5>
                    <p class="small text-muted mb-0">Book a session with one of our expert trainers to get started.</p>
                </td>
            </tr>`;
        return;
    }

    activeAppointments.forEach(app => {
        const dateObj = new Date(app.date);
        const date = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const statusClass = `appointment-status-badge status-${app.status}`;
        const trainerName = app.trainerId?.firstName ? `${app.trainerId.firstName} ${app.trainerId.lastName || ''}` : 'N/A';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ps-4">
                <div class="fw-bold">${date}</div>
                <div class="text-muted small"><i class="bi bi-clock me-1"></i>${app.time}</div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                        ${app.trainerId?.firstName?.charAt(0) || 'T'}
                    </div>
                    <span>${trainerName}</span>
                </div>
            </td>
            <td><span class="${statusClass}">${app.status}</span></td>
            <td class="d-none d-lg-table-cell">
                <div class="text-truncate text-muted" style="max-width: 200px;" title="${app.notes || ''}">${app.notes || '<span class="opacity-50 italic">No special notes</span>'}</div>
            </td>
            <td class="text-end pe-4">
                <div class="btn-group">
                    <button data-id="${app._id}" class="btn btn-sm btn-outline-primary view-btn" title="View"><i class="bi bi-eye"></i></button>
                    <button data-id="${app._id}" class="btn btn-sm btn-outline-secondary edit-btn" title="Edit"><i class="bi bi-pencil"></i></button>
                    <button data-id="${app._id}" class="btn btn-sm btn-outline-danger delete-btn" title="Delete"><i class="bi bi-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', e => viewAppointment(e.target.dataset.id)));
    tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', e => editAppointment(e.target.dataset.id)));
    tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', e => deleteAppointment(e.target.dataset.id)));
}

// ====== Show Error ======
function showError(message) {
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center text-danger">
                <i class="bi bi-exclamation-triangle"></i> ${message}
            </td>
        </tr>`;
}

// ====== View Appointment ======
async function viewAppointment(id) {
    try {
        currentViewAppointmentId = id;
        const appointment = await authFetch(`${window.API_BASE}/api/appointments/${id}`);

        const detailsDiv = document.getElementById('appointmentDetails');
        detailsDiv.innerHTML = `
            <p><strong>Date:</strong> ${new Date(appointment.date).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${appointment.time}</p>
            <p><strong>Trainer:</strong> ${appointment.trainerId ? `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}` : 'N/A'}</p>
            <p><strong>Status:</strong> ${appointment.status}</p>
            <p><strong>Client:</strong> ${appointment.clientId ? `${appointment.clientId.firstName} ${appointment.clientId.lastName}` : 'N/A'}</p>
            <p><strong>Notes:</strong> ${appointment.notes || 'N/A'}</p>
            <p><strong>Created At:</strong> ${new Date(appointment.createdAt).toLocaleString()}</p>
            <p><strong>Updated At:</strong> ${new Date(appointment.updatedAt).toLocaleString()}</p>`;

        new bootstrap.Modal(document.getElementById('appointmentModal')).show();
    } catch (err) {
        console.error('Error viewing appointment:', err);
        window.Toast.error('Failed to load appointment details.');
    }
}

// ====== Load Trainers ======
async function loadTrainersInto(selectElement, selectedId = '') {
    try {
        const data = await authFetch(`${window.API_BASE}/api/users/trainers`);
        const trainers = data.trainers;
        selectElement.innerHTML = '<option value="">Choose...</option>';
        trainers.forEach(trainer => {
            const option = document.createElement('option');
            option.value = trainer._id;
            option.textContent = `${trainer.firstName} ${trainer.lastName}`;
            selectElement.appendChild(option);
        });
        if (selectedId) selectElement.value = selectedId;
    } catch (err) {
        console.error('Error loading trainers:', err);
    }
}

// ====== Edit Appointment ======
const editModal = new bootstrap.Modal(document.getElementById('editAppointmentModal'));
async function editAppointment(id) {
    try {
        currentEditAppointmentId = id;
        const app = await authFetch(`${window.API_BASE}/api/appointments/${id}`);

        document.getElementById('editAppointmentDate').value = new Date(app.date).toISOString().slice(0, 10);
        document.getElementById('editAppointmentTime').value = app.time;
        document.getElementById('editAppointmentNotes').value = app.notes || '';
        await loadTrainersInto(document.getElementById('editTrainerSelect'), app.trainerId?._id);

        editModal.show();
    } catch (err) {
        console.error('Error editing appointment:', err);
        window.Toast.error('Failed to load appointment for editing.');
    }
}

// ====== Save Edited Appointment ======
document.getElementById('editAppointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentEditAppointmentId) return;

    try {
        const payload = {
            date: document.getElementById('editAppointmentDate').value,
            time: document.getElementById('editAppointmentTime').value,
            notes: document.getElementById('editAppointmentNotes').value,
            trainerId: document.getElementById('editTrainerSelect').value
        };
        await authFetch(`${window.API_BASE}/api/appointments/${currentEditAppointmentId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        editModal.hide();
        loadAppointments();
        window.Toast.success('Appointment updated successfully.');
    } catch (err) {
        console.error('Error updating appointment:', err);
        window.Toast.error('Failed to update appointment.');
    }
});

// ====== Delete Appointment ======
async function deleteAppointment(id) {
    showConfirm('Are you sure you want to delete this appointment?', async () => {
        try {
            await authFetch(`${window.API_BASE}/api/appointments/${id}`, { method: 'DELETE' });
            loadAppointments();
            window.Toast.success('Appointment deleted successfully.');
        } catch (err) {
            console.error('Error deleting appointment:', err);
            window.Toast.error('Failed to delete appointment.');
        }
    });
}

// ====== Create Appointment ======
document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!userSubscriptionStatus) { 
        window.Toast.warning('You need an active subscription to book appointments.'); 
        return; 
    }

    try {
        const payload = {
            date: document.getElementById('appointmentDate').value,
            time: document.getElementById('appointmentTime').value,
            notes: document.getElementById('appointmentNotes').value,
            trainerId: document.getElementById('trainerSelect').value
        };
        if (!payload.date || !payload.time || !payload.trainerId) {
            window.Toast.warning('Date, time, and trainer are required.');
            return;
        }

        // Add confirmation for booking
        showConfirm('Do you want to book this appointment?', async () => {
            try {
                await authFetch(`${window.API_BASE}/api/appointments`, { method: 'POST', body: JSON.stringify(payload) });

                // Close modal
                const bookingModal = bootstrap.Modal.getInstance(document.getElementById('bookingModal'));
                if (bookingModal) bookingModal.hide();

                e.target.reset();
                loadAppointments();
                window.Toast.success('Appointment booked successfully!');
            } catch (innerErr) {
                console.error('Error creating appointment:', innerErr);
                window.Toast.error('Failed to create appointment.');
            }
        });
    } catch (err) {
        console.error('Error in form submission:', err);
    }
});

/**
 * Utility for confirmation modal
 */
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

// ====== Initialization ======
document.addEventListener('DOMContentLoaded', async () => {
    const hasSubscription = await checkSubscriptionStatus();

    // Subscription lock
    const subscriptionLock = document.getElementById('subscriptionLock');
    if (subscriptionLock) subscriptionLock.style.display = hasSubscription ? 'none' : 'block';

    // Update all booking trigger buttons
    const bookingButtons = document.querySelectorAll('[data-bs-target="#bookingModal"]');
    bookingButtons.forEach(btn => {
        if (hasSubscription) {
            btn.disabled = false;
            // Preserve the original text if it's the "New Booking" button
            if (btn.id !== 'bookNowTopBtn') btn.innerHTML = 'Book Now <i class="bi bi-calendar-check"></i>';
            btn.classList.replace('btn-secondary', 'btn-primary');
        } else {
            btn.disabled = true;
            btn.textContent = 'Subscription Required';
            btn.classList.replace('btn-primary', 'btn-secondary');
        }
    });

    // Load appointments & trainers if subscribed
    if (hasSubscription) {
        const trainerSelect = document.getElementById('trainerSelect');
        if (trainerSelect) await loadTrainersInto(trainerSelect);
        await loadAppointments();
    }

    // Set minimum dates
    const today = new Date().toISOString().split('T')[0];
    ['appointmentDate', 'editAppointmentDate'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });

    // Refresh button
    document.getElementById('refreshAppointments')?.addEventListener('click', loadAppointments);
    document.getElementById('editAppointmentBtn')?.addEventListener('click', () => {
        if (currentViewAppointmentId) editAppointment(currentViewAppointmentId);
    });
});
