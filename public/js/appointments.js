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

        const hasActiveSub = sub?.hasActiveSubscription || (sub?.hasSubscription && sub?.isActive);
        const isPeriodValid = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) > new Date() : true;

        userSubscriptionStatus = hasActiveSub && isPeriodValid;
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
        const appointments = await authFetch(`${window.API_BASE}/api/appointments/user`);
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
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No appointments found</td></tr>`;
        return;
    }

    activeAppointments.forEach(app => {
        const date = new Date(app.date).toLocaleDateString();
        const statusClass = app.status === 'scheduled' ? 'text-success' :
                            app.status === 'cancelled' ? 'text-danger' : 'text-warning';
        const trainerName = app.trainerId?.firstName ? `${app.trainerId.firstName} ${app.trainerId.lastName || ''}` : 'N/A';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${date}</td>
            <td>${app.time}</td>
            <td>${trainerName}</td>
            <td class="${statusClass}">${app.status}</td>
            <td>${app.notes || 'N/A'}</td>
            <td>
                <button data-id="${app._id}" class="btn btn-sm btn-outline-primary view-btn">View</button>
                <button data-id="${app._id}" class="btn btn-sm btn-outline-secondary edit-btn">Edit</button>
                <button data-id="${app._id}" class="btn btn-sm btn-outline-danger delete-btn">Delete</button>
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
        alert('Failed to load appointment details.');
    }
}

// ====== Load Trainers ======
async function loadTrainersInto(selectElement, selectedId = '') {
    try {
        const trainers = await authFetch(`${window.API_BASE}/api/users/trainers`);
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
        alert('Failed to load appointment for editing.');
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
        alert('Appointment updated successfully.');
    } catch (err) {
        console.error('Error updating appointment:', err);
        alert('Failed to update appointment.');
    }
});

// ====== Delete Appointment ======
async function deleteAppointment(id) {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    try {
        await authFetch(`${window.API_BASE}/api/appointments/${id}`, { method: 'DELETE' });
        loadAppointments();
    } catch (err) {
        console.error('Error deleting appointment:', err);
        alert('Failed to delete appointment.');
    }
}

// ====== Create Appointment ======
document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!userSubscriptionStatus) { alert('You need an active subscription to book appointments.'); return; }

    try {
        const payload = {
            date: document.getElementById('appointmentDate').value,
            time: document.getElementById('appointmentTime').value,
            notes: document.getElementById('appointmentNotes').value,
            trainerId: document.getElementById('trainerSelect').value
        };
        if (!payload.date || !payload.time || !payload.trainerId) return alert('Date, time, and trainer are required.');

        await authFetch(`${window.API_BASE}/api/appointments`, { method: 'POST', body: JSON.stringify(payload) });

        e.target.reset();
        loadAppointments();
        alert('Appointment booked successfully!');
    } catch (err) {
        console.error('Error creating appointment:', err);
        alert('Failed to create appointment.');
    }
});

// ====== Initialization ======
document.addEventListener('DOMContentLoaded', async () => {
    const hasSubscription = await checkSubscriptionStatus();

    // Subscription lock
    const subscriptionLock = document.getElementById('subscriptionLock');
    if (subscriptionLock) subscriptionLock.style.display = hasSubscription ? 'none' : 'block';

    // Book Now button
    const bookBtn = document.querySelector('[data-bs-toggle="modal"][data-bs-target="#bookingModal"]');
    if (bookBtn) {
        bookBtn.disabled = !hasSubscription;
        bookBtn.textContent = hasSubscription ? 'Book Now' : 'Subscription Required';
        bookBtn.classList.toggle('btn-success', hasSubscription);
        bookBtn.classList.toggle('btn-secondary', !hasSubscription);
    }

    // Load appointments & trainers if subscribed
    if (hasSubscription) {
        await loadTrainersInto(document.getElementById('trainerSelect'));
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
