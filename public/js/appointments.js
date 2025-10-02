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
function viewAppointment(appointmentId) {
    console.log('View appointment:', appointmentId);
    // TODO: Implement view functionality
}

// Edit appointment
function editAppointment(appointmentId) {
    console.log('Edit appointment:', appointmentId);
    // TODO: Implement edit functionality
}

// Delete appointment
async function deleteAppointment(appointmentId) {
    if (confirm('Are you sure you want to delete this appointment?')) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
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
