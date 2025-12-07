const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

let currentViewAppointmentId = null;
let currentEditAppointmentId = null;

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
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">No appointments found</td>
            </tr>`;
        return;
    }

    activeAppointments.forEach(appointment => {
        const row = document.createElement('tr');
        const date = new Date(appointment.date).toLocaleDateString();
        const statusClass = appointment.status === 'scheduled' ? 'text-success' :
                            appointment.status === 'cancelled' ? 'text-danger' : 'text-warning';
        const trainerName = appointment.trainerId ? `${appointment.trainerId.firstName || 'N/A'} ${appointment.trainerId.lastName || ''}` : 'N/A';

        row.innerHTML = `
            <td>${date}</td>
            <td>${appointment.time}</td>
            <td>${trainerName}</td>
            <td class="${statusClass}">${appointment.status}</td>
            <td>${appointment.notes || 'N/A'}</td>
            <td>
                <button data-id="${appointment._id}" class="btn btn-sm btn-outline-primary view-btn">View</button>
                <button data-id="${appointment._id}" class="btn btn-sm btn-outline-secondary edit-btn">Edit</button>
                <button data-id="${appointment._id}" class="btn btn-sm btn-outline-danger delete-btn">Delete</button>
            </td>`;
        tbody.appendChild(row);
    });

    // Button event listeners
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
    .then(appointment => {
        document.getElementById('editAppointmentDate').value = new Date(appointment.date).toISOString().slice(0, 10);
        document.getElementById('editAppointmentTime').value = appointment.time;
        document.getElementById('editAppointmentNotes').value = appointment.notes || '';
        document.getElementById('editTrainerSelect').value = appointment.trainerId?._id || '';

        editModal.show();
    })
    .catch(err => {
        console.error('Error fetching appointment for edit:', err);
        alert('Failed to load appointment details for editing. Please try again.');
    });
}

// ====== Save Edited Appointment ======
document.getElementById('editAppointmentForm').addEventListener('submit', e => {
    e.preventDefault();

    const date = document.getElementById('editAppointmentDate').value;
    const time = document.getElementById('editAppointmentTime').value;
    const notes = document.getElementById('editAppointmentNotes').value;
    const trainerId = document.getElementById('editTrainerSelect').value;

    if (!date || !time) {
        alert('Date and time are required.');
        return;
    }

    fetch(`${API_BASE_URL}/api/appointments/${currentEditAppointmentId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        },
        body: JSON.stringify({ date, time, notes, trainerId })
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        return res.json();
    })
    .then(() => {
        editModal.hide();
        loadAppointments();
        alert('Appointment updated successfully.');
    })
    .catch(err => {
        console.error('Error updating appointment:', err);
        alert('Failed to update appointment. Please try again.');
    });
});

// ====== Delete Appointment ======
async function deleteAppointment(appointmentId) {
    if (!confirm('Are you sure you want to delete this appointment? This action cannot be undone.')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        loadAppointments();
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Failed to delete appointment. Please try again.');
    }
}

// ====== Load Trainers Dynamically ======
async function loadTrainers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/trainers`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        if (!response.ok) throw new Error('Failed to fetch trainers');

        const trainers = await response.json();

        const selects = [
            document.getElementById('trainerSelect'),
            document.getElementById('editTrainerSelect')
        ];

        selects.forEach(select => {
            select.innerHTML = '<option value="">Choose...</option>';
            trainers.forEach(trainer => {
                const option = document.createElement('option');
                option.value = trainer._id;
                option.textContent = `${trainer.firstName} ${trainer.lastName}`;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error loading trainers:', error);
    }
}

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
    loadAppointments();
    loadTrainers();

    document.getElementById('refreshAppointments')?.addEventListener('click', loadAppointments);
    document.getElementById('editAppointmentBtn')?.addEventListener('click', () => {
        if (currentViewAppointmentId) editAppointment(currentViewAppointmentId);
    });
});
