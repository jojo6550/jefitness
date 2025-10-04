const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jojo6550-github-io.onrender.com';

// Load user's appointments
async function loadAppointments() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/user`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const appointments = await response.json();
        displayAppointments(appointments);
    } catch (error) {
        console.error('Error loading appointments:', error);
        showError('Failed to load appointments. Please try again.');
    }
}

// Display appointments in table
function displayAppointments(appointments) {
    // Filter out cancelled appointments
    const activeAppointments = appointments.filter(app => app.status !== 'cancelled');

    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = '';

    if (activeAppointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">No appointments found</td>
            </tr>
        `;
        return;
    }

    activeAppointments.forEach(appointment => {
        const row = document.createElement('tr');
        const date = new Date(appointment.date).toLocaleDateString();
        const statusClass = appointment.status === 'scheduled' ? 'text-success' :
                           appointment.status === 'cancelled' ? 'text-danger' :
                           'text-warning';

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
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners for buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => viewAppointment(e.target.dataset.id));
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editAppointment(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteAppointment(e.target.dataset.id));
    });
}

// Show error message
function showError(message) {
    const tbody = document.getElementById('appointmentsTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center text-danger">
                <i class="bi bi-exclamation-triangle"></i> ${message}
            </td>
        </tr>
    `;
}

// View appointment details
async function viewAppointment(appointmentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const appointment = await response.json();

        // Populate modal
        document.getElementById('modalDate').textContent = new Date(appointment.date).toLocaleDateString();
        document.getElementById('modalTime').textContent = appointment.time;
        document.getElementById('modalTrainer').textContent = appointment.trainerId ? `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}` : 'N/A';
        document.getElementById('modalStatus').textContent = appointment.status;
        document.getElementById('modalClient').textContent = appointment.clientId ? `${appointment.clientId.firstName} ${appointment.clientId.lastName}` : 'N/A';
        document.getElementById('modalNotes').textContent = appointment.notes || 'N/A';

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('appointmentModal'));
        modal.show();
    } catch (error) {
        console.error('Error viewing appointment:', error);
        alert('Failed to load appointment details. Please try again.');
    }
}

// Edit appointment
let currentEditAppointmentId = null;
const editModalElement = document.getElementById('editAppointmentModal');
const editModal = new bootstrap.Modal(editModalElement);

function editAppointment(appointmentId) {
    currentEditAppointmentId = appointmentId;
    // Fetch appointment details
    fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(appointment => {
        // Populate form fields
        document.getElementById('editDate').value = new Date(appointment.date).toISOString().slice(0, 10);
        document.getElementById('editTime').value = appointment.time;
        document.getElementById('editNotes').value = appointment.notes || '';

        // Show modal
        editModal.show();
    })
    .catch(error => {
        console.error('Error fetching appointment for edit:', error);
        alert('Failed to load appointment details for editing. Please try again.');
    });
}

// Save edited appointment
document.getElementById('saveEditBtn').addEventListener('click', () => {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    const notes = document.getElementById('editNotes').value;

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
        body: JSON.stringify({ date, time, notes })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(updatedAppointment => {
        editModal.hide();
        loadAppointments();
        alert('Appointment updated successfully.');
    })
    .catch(error => {
        console.error('Error updating appointment:', error);
        alert('Failed to update appointment. Please try again.');
    });
});

// Delete appointment
async function deleteAppointment(appointmentId) {
    if (confirm('Are you sure you want to delete this appointment? This action cannot be undone.')) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }

            // Reload appointments after deletion
            loadAppointments();
        } catch (error) {
            console.error('Error deleting appointment:', error);
            alert('Failed to delete appointment. Please try again.');
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAppointments();

    // Refresh button
    const refreshBtn = document.getElementById('refreshAppointments');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAppointments);
    }
});
