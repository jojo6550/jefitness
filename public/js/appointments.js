const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

let currentViewAppointmentId = null;
let currentEditAppointmentId = null;
let userSubscriptionStatus = null;

// ====== Check Subscription Status ======
async function checkSubscriptionStatus() {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        const response = await fetch(`${API_BASE_URL}/subscriptions/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('Could not check subscription status');
            return false;
        }

        const subsData = await response.json();

        if (subsData.success && subsData.data && subsData.data.hasSubscription && subsData.data.status === 'active') {
            userSubscriptionStatus = true;
            return true;
        } else {
            userSubscriptionStatus = false;
            return false;
        }
    } catch (error) {
        console.error('Error checking subscription status:', error);
        return false;
    }
}

// ====== Load Appointments ======
async function loadAppointments() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/user`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        const appointments = await response.json();
        displayAppointments(appointments);
    } catch (error) {
        console.error('Error loading appointments:', error);
        showError('Failed to load appointments. Please try again.');
    }
}

function displayAppointments(appointments) {
    const activeAppointments = appointments.filter(app => app.status !== 'cancelled');
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = '';

    if (activeAppointments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No appointments found</td></tr>`;
        return;
    }

    activeAppointments.forEach(app => {
        const row = document.createElement('tr');
        const date = new Date(app.date).toLocaleDateString();
        const statusClass = app.status === 'scheduled' ? 'text-success' :
                            app.status === 'cancelled' ? 'text-danger' : 'text-warning';
        const trainerName = app.trainerId ? `${app.trainerId.firstName || 'N/A'} ${app.trainerId.lastName || ''}` : 'N/A';

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

    document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', e => viewAppointment(e.target.dataset.id)));
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', e => editAppointment(e.target.dataset.id)));
    document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', e => deleteAppointment(e.target.dataset.id)));
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
async function viewAppointment(appointmentId) {
    try {
        currentViewAppointmentId = appointmentId;
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        const appointment = await response.json();

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
    } catch (error) {
        console.error('Error viewing appointment:', error);
        alert('Failed to load appointment details. Please try again.');
    }
}

// ====== Reusable: Load Trainers into any select ======
async function loadTrainersInto(selectElement, selectedId = '') {
    try {
        const resp = await fetch(`${API_BASE_URL}/api/users/trainers`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!resp.ok) throw new Error('Failed to fetch trainers');
        const trainers = await resp.json();

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
const editModalElement = document.getElementById('editAppointmentModal');
const editModal = new bootstrap.Modal(editModalElement);

function editAppointment(appointmentId) {
    currentEditAppointmentId = appointmentId;

    fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        return res.json();
    })
    .then(async appointment => {
        document.getElementById('editAppointmentDate').value = new Date(appointment.date).toISOString().slice(0, 10);
        document.getElementById('editAppointmentTime').value = appointment.time;
        document.getElementById('editAppointmentNotes').value = appointment.notes || '';

        await loadTrainersInto(document.getElementById('editTrainerSelect'), appointment.trainerId?._id);
        editModal.show();
    })
    .catch(err => {
        console.error('Error fetching appointment for edit:', err);
        alert('Failed to load appointment details for editing. Please try again.');
    });
}

// ====== Save Edited Appointment ======
document.getElementById('editAppointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const date = document.getElementById('editAppointmentDate').value;
    const time = document.getElementById('editAppointmentTime').value;
    const notes = document.getElementById('editAppointmentNotes').value;
    const trainerId = document.getElementById('editTrainerSelect').value;

    if (!date || !time) { alert('Date and time are required.'); return; }

    try {
        const res = await fetch(`${API_BASE_URL}/api/appointments/${currentEditAppointmentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify({ date, time, notes, trainerId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        editModal.hide();
        loadAppointments();
        alert('Appointment updated successfully.');
    } catch (err) {
        console.error('Error updating appointment:', err);
        alert('Failed to update appointment. Please try again.');
    }
});

// ====== Delete Appointment ======
async function deleteAppointment(appointmentId) {
    if (!confirm('Are you sure you want to delete this appointment? This action cannot be undone.')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        loadAppointments();
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment. Please try again.');
    }
}

// ====== Create New Appointment ======
document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();

    const date = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTime').value;
    const notes = document.getElementById('appointmentNotes').value;
    const trainerId = document.getElementById('trainerSelect').value;

    if (!date || !time || !trainerId) { alert('Date, time, and trainer are required.'); return; }

    let res;
    try {
        res = await fetch(`${API_BASE_URL}/api/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify({ date, time, notes, trainerId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        await res.json();

        e.target.reset();
        loadAppointments();
        alert('Appointment booked successfully!');
    } catch (err) {
        console.error('Error creating appointment:', err);
        // Try to get the error message from the response
        if (res && res.status === 400) {
            try {
                const errorData = await res.json();
                console.error('Server error message:', errorData.msg);
                alert(`Failed to create appointment: ${errorData.msg}`);
            } catch (parseErr) {
                console.error('Could not parse error response:', parseErr);
                alert('Failed to create appointment. Please try again.');
            }
        } else {
            alert('Failed to create appointment. Please try again.');
        }
    }
});

// ====== Init ======
document.addEventListener('DOMContentLoaded', async () => {
    // Check subscription status first
    const hasActiveSubscription = await checkSubscriptionStatus();

    // Show/hide subscription lock message
    const subscriptionLock = document.getElementById('subscriptionLock');
    if (subscriptionLock) {
        subscriptionLock.style.display = hasActiveSubscription ? 'none' : 'block';
    }

    // Disable booking functionality for non-subscribers
    const bookNowBtn = document.querySelector('[data-bs-toggle="modal"][data-bs-target="#bookingModal"]');
    if (bookNowBtn && !hasActiveSubscription) {
        bookNowBtn.disabled = true;
        bookNowBtn.textContent = 'Subscription Required';
        bookNowBtn.classList.remove('btn-success');
        bookNowBtn.classList.add('btn-secondary');
    }

    loadAppointments();

    // Load trainers into booking form only if user has subscription
    if (hasActiveSubscription) {
        const newTrainerSelect = document.getElementById('trainerSelect');
        if (newTrainerSelect) await loadTrainersInto(newTrainerSelect);
    }

    // Set minimum date to today for date inputs
    const today = new Date().toISOString().split('T')[0];
    const appointmentDateInput = document.getElementById('appointmentDate');
    const editAppointmentDateInput = document.getElementById('editAppointmentDate');
    if (appointmentDateInput) appointmentDateInput.min = today;
    if (editAppointmentDateInput) editAppointmentDateInput.min = today;

    document.getElementById('refreshAppointments')?.addEventListener('click', loadAppointments);
    document.getElementById('editAppointmentBtn')?.addEventListener('click', () => {
        if (currentViewAppointmentId) editAppointment(currentViewAppointmentId);
    });
});
