// public/js/appointments.js

// Initialize API base with localhost SSL fallback
window.API_BASE = window.ApiConfig?.getAPI_BASE?.() || '';

if (window.API_BASE?.startsWith('https://localhost')) {
    console.warn('SSL Fix: Converting HTTPS localhost → HTTP backend');
    window.API_BASE = window.API_BASE.replace(/^https:/, 'http:');
}

const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// ====== Helpers ======
const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
};

// ====== State ======
let currentViewAppointmentId = null;
let currentEditAppointmentId = null;
let userSubscriptionStatus = false;

// ====== Helper: Fetch with Auth ======
async function authFetch(url, options = {}) {
    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json'
    };
    options.credentials = 'include';

    const res = await fetch(url, options);

    if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        // GDPR: Do NOT silently auto-grant consent
        if (body.code === 'CONSENT_REQUIRED') {
            throw new Error('Data processing consent is required. Please update your privacy settings.');
        }
        const errMsg = typeof body.error === 'string'
            ? body.error
            : (body.error?.message || body.message || `HTTP 403 - Forbidden`);
        throw new Error(errMsg);
    }

    if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status} - ${errorText}`);
    }

    return res.json();
}

// ====== Subscription Check ======
async function checkSubscriptionStatus() {
    try {
        const data = await authFetch(`${window.API_BASE}/api/v1/subscriptions/current`);
        const sub = data.data;

        if (!sub) {
            userSubscriptionStatus = false;
            return false;
        }

        const validStatuses = ['active', 'trialing', 'past_due', 'paused', 'incomplete'];
        const isActive = validStatuses.includes(sub.status);
        const isPeriodValid = !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date();

        userSubscriptionStatus = isActive && isPeriodValid;
        return userSubscriptionStatus;
    } catch (err) {
        if (isDev) console.error('Error checking subscription:', err);
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
        const data = await authFetch(`${window.API_BASE}/api/v1/appointments/user`);
        const appointments = data.appointments || [];
        displayAppointments(appointments);
    } catch (err) {
        console.error('Error loading appointments:', err);
        showError('Failed to load appointments. Please try again.');
    }
}

// ====== Display Appointments ======
function displayAppointments(appointments) {
    const tbody = document.getElementById('appointmentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const activeAppointments = appointments.filter(app => app.status !== 'cancelled');

    if (activeAppointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5">
                    <div class="mb-3">
                        <i class="bi bi-calendar-x text-muted appt-empty-icon"></i>
                    </div>
                    <h5 class="text-muted">No upcoming appointments</h5>
                    <p class="small text-muted mb-0">Book a session with one of our expert trainers to get started.</p>
                </td>
            </tr>`;
        return;
    }

    activeAppointments.forEach(app => {
        const dateObj = new Date(app.date);
        const date = dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const statusClass = `appointment-status-badge status-${escapeHtml(app.status || 'unknown')}`;
        const trainerName = app.trainerId?.firstName
            ? `${escapeHtml(app.trainerId.firstName)} ${escapeHtml(app.trainerId.lastName || '')}`.trim()
            : 'N/A';

        const trainerInitial = escapeHtml(app.trainerId?.firstName?.charAt(0) || 'T');
        const notes = escapeHtml(app.notes || '');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ps-4">
                <div class="fw-bold">${date}</div>
                <div class="text-muted small"><i class="bi bi-clock me-1"></i>${escapeHtml(app.time || '')}</div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center appt-trainer-avatar">
                        ${trainerInitial}
                    </div>
                    <span>${trainerName}</span>
                </div>
            </td>
            <td><span class="${statusClass}">${escapeHtml(app.status || 'unknown')}</span></td>
            <td class="d-none d-lg-table-cell">
                <div class="text-truncate text-muted appt-notes-cell" title="${notes}">
                    ${notes || '<span class="opacity-50 fst-italic">No special notes</span>'}
                </div>
            </td>
            <td class="text-end pe-4">
                <div class="btn-group">
                    <button data-id="${escapeHtml(app._id)}" class="btn btn-sm btn-outline-secondary edit-btn" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button data-id="${escapeHtml(app._id)}" class="btn btn-sm btn-outline-danger delete-btn" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>`;

        tbody.appendChild(row);
    });

    // Attach event listeners
    tbody.querySelectorAll('.edit-btn').forEach(btn =>
        btn.addEventListener('click', () => editAppointment(btn.dataset.id))
    );

    tbody.querySelectorAll('.delete-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteAppointment(btn.dataset.id))
    );
}

// ====== Show Error ======
function showError(message) {
    const tbody = document.getElementById('appointmentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle me-2"></i> ${escapeHtml(message)}
            </td>
        </tr>`;
}

// ====== View Appointment ======
async function viewAppointment(id) {
    try {
        currentViewAppointmentId = id;
        const appointment = await authFetch(`${window.API_BASE}/api/v1/appointments/${id}`);

        const detailsDiv = document.getElementById('appointmentDetails');
        const trainerDisplay = appointment.trainerId
            ? `${escapeHtml(appointment.trainerId.firstName)} ${escapeHtml(appointment.trainerId.lastName)}`
            : 'N/A';
        const clientDisplay = appointment.clientId
            ? `${escapeHtml(appointment.clientId.firstName)} ${escapeHtml(appointment.clientId.lastName)}`
            : 'N/A';

        detailsDiv.innerHTML = `
            <p><strong>Date:</strong> ${escapeHtml(new Date(appointment.date).toLocaleDateString())}</p>
            <p><strong>Time:</strong> ${escapeHtml(appointment.time)}</p>
            <p><strong>Trainer:</strong> ${trainerDisplay}</p>
            <p><strong>Status:</strong> ${escapeHtml(appointment.status)}</p>
            <p><strong>Client:</strong> ${clientDisplay}</p>
            <p><strong>Notes:</strong> ${escapeHtml(appointment.notes) || 'N/A'}</p>
            <p><strong>Created At:</strong> ${escapeHtml(new Date(appointment.createdAt).toLocaleString())}</p>
            <p><strong>Updated At:</strong> ${escapeHtml(new Date(appointment.updatedAt).toLocaleString())}</p>`;

        new bootstrap.Modal(document.getElementById('appointmentModal')).show();
    } catch (err) {
        console.error('Error viewing appointment:', err);
        window.Toast?.error?.('Failed to load appointment details.') || alert('Failed to load appointment details.');
    }
}

// ====== Load Trainers ======
async function loadTrainersInto(selectElement, selectedId = '') {
    if (!selectElement) return;
    try {
        const data = await authFetch(`${window.API_BASE}/api/v1/users/trainers`);
        const trainers = data.trainers || [];

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

// ====== Load Time Slots from Trainer Availability ======
async function loadTrainerSlots(trainerId, dateStr, selectEl) {
    if (!selectEl) return;
    if (!trainerId || !dateStr) {
        selectEl.innerHTML = '<option value="">Select a trainer and date first...</option>';
        return;
    }

    try {
        const data = await authFetch(`${window.API_BASE}/api/v1/trainer/${trainerId}/availability`);
        const availability = data.availability || [];
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const daySlot = availability.find(s => s.dayOfWeek === dayOfWeek);

        if (!daySlot) {
            selectEl.innerHTML = '<option value="">Trainer unavailable on this day</option>';
            return;
        }

        selectEl.innerHTML = '<option value="">Choose a time...</option>';

        for (let h = daySlot.startHour; h < daySlot.endHour; h++) {
            const padded = String(h).padStart(2, '0') + ':00';
            const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const ampm = h < 12 ? 'AM' : 'PM';

            const option = document.createElement('option');
            option.value = padded;
            option.textContent = `${displayHour}:00 ${ampm}`;
            selectEl.appendChild(option);
        }
    } catch (err) {
        console.error('Error loading trainer slots:', err);
        selectEl.innerHTML = '<option value="">Failed to load times</option>';
    }
}

// ====== Edit Appointment ======
const editModalEl = document.getElementById('editAppointmentModal');
const editModal = new bootstrap.Modal(editModalEl || document.createElement('div'));

// Prevent aria-hidden focus issues
if (editModalEl) {
    editModalEl.addEventListener('hidden.bs.modal', () => {
        document.activeElement?.blur();
    });
}

async function editAppointment(id) {
    try {
        currentEditAppointmentId = id;
        const app = await authFetch(`${window.API_BASE}/api/v1/appointments/${id}`);

        const editDateVal = new Date(app.date).toISOString().slice(0, 10);

        document.getElementById('editAppointmentDate').value = editDateVal;
        document.getElementById('editAppointmentNotes').value = app.notes || '';

        await loadTrainersInto(document.getElementById('editTrainerSelect'), app.trainerId?._id);

        const editTimeSel = document.getElementById('editAppointmentTime');
        await loadTrainerSlots(app.trainerId?._id, editDateVal, editTimeSel);
        editTimeSel.value = app.time || '';

        editModal.show();
    } catch (err) {
        console.error('Error editing appointment:', err);
        window.Toast?.error?.('Failed to load appointment for editing.') || alert('Failed to load appointment for editing.');
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

        await authFetch(`${window.API_BASE}/api/v1/appointments/${currentEditAppointmentId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        editModal.hide();
        loadAppointments();
        window.Toast?.success?.('Appointment updated successfully.') || alert('Appointment updated successfully.');
    } catch (err) {
        console.error('Error updating appointment:', err);
        window.Toast?.error?.('Failed to update appointment.') || alert('Failed to update appointment.');
    }
});

// ====== Delete Appointment ======
async function deleteAppointment(id) {
    showConfirm('Are you sure you want to delete this appointment?', async () => {
        try {
            await authFetch(`${window.API_BASE}/api/v1/appointments/${id}`, { method: 'DELETE' });
            loadAppointments();
            window.Toast?.success?.('Appointment deleted successfully.') || alert('Appointment deleted successfully.');
        } catch (err) {
            console.error('Error deleting appointment:', err);
            window.Toast?.error?.('Failed to delete appointment.') || alert('Failed to delete appointment.');
        }
    });
}

// ====== Create Appointment ======
document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!userSubscriptionStatus) {
        window.Toast?.warning?.('You need an active subscription to book appointments.') || alert('Subscription required');
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
            window.Toast?.warning?.('Date, time, and trainer are required.') || alert('Date, time, and trainer are required.');
            return;
        }

        showConfirm('Do you want to book this appointment?', async () => {
            try {
                await authFetch(`${window.API_BASE}/api/v1/appointments`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const bookingModal = bootstrap.Modal.getInstance(document.getElementById('bookingModal'));
                if (bookingModal) bookingModal.hide();

                e.target.reset();
                loadAppointments();
                window.Toast?.success?.('Appointment booked successfully!') || alert('Appointment booked successfully!');
            } catch (innerErr) {
                console.error('Error creating appointment:', innerErr);
                // Extract error message from API response if available
                let errorMsg = innerErr.message || 'Failed to create appointment.';
                if (errorMsg.startsWith('HTTP 400 - ')) {
                    try {
                        const jsonStr = errorMsg.replace('HTTP 400 - ', '');
                        const parsed = JSON.parse(jsonStr);
                        errorMsg = parsed.msg || parsed.error || errorMsg;
                    } catch (e) {
                        // Keep original error message if JSON parse fails
                    }
                }
                window.Toast?.error?.(errorMsg) || alert(errorMsg);
            }
        });
    } catch (err) {
        console.error('Error in form submission:', err);
    }
});

// ====== Confirmation Modal Utility ======
function showConfirm(message, callback) {
    const confirmModalEl = document.getElementById('confirmModal');
    if (!confirmModalEl) {
        if (confirm(message)) callback();
        return;
    }

    const modalBody = document.getElementById('confirmModalBody');
    if (modalBody) modalBody.textContent = message;

    const confirmBtn = document.getElementById('confirmActionBtn');
    const modal = bootstrap.Modal.getOrCreateInstance(confirmModalEl);

    const onConfirm = () => {
        confirmBtn.removeEventListener('click', onConfirm);
        modal.hide();
        callback();
    };

    const onHidden = () => {
        confirmBtn.blur();
        confirmModalEl.removeEventListener('hidden.bs.modal', onHidden);
    };

    confirmBtn.addEventListener('click', onConfirm);
    confirmModalEl.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
}

// ====== Initialization ======
document.addEventListener('DOMContentLoaded', async () => {
    const hasSubscription = await checkSubscriptionStatus();

    // Subscription lock
    const subscriptionLock = document.getElementById('subscriptionLock');
    if (subscriptionLock) subscriptionLock.classList.toggle('d-none', hasSubscription);

    // Update booking trigger buttons
    const bookingButtons = document.querySelectorAll('[data-bs-target="#bookingModal"]');
    bookingButtons.forEach(btn => {
        if (hasSubscription) {
            btn.disabled = false;
            if (btn.id !== 'bookNowTopBtn') {
                btn.innerHTML = 'Book Now <i class="bi bi-calendar-check"></i>';
            }
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

    // Set minimum dates for date inputs
    const today = new Date().toISOString().split('T')[0];
    ['appointmentDate', 'editAppointmentDate'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });

    // Dynamic time slots - Booking form
    const bookingTrainerSel = document.getElementById('trainerSelect');
    const bookingDateInput = document.getElementById('appointmentDate');
    const bookingTimeSel = document.getElementById('appointmentTime');

    const reloadBookingSlots = () => loadTrainerSlots(bookingTrainerSel?.value, bookingDateInput?.value, bookingTimeSel);
    bookingTrainerSel?.addEventListener('change', reloadBookingSlots);
    bookingDateInput?.addEventListener('change', reloadBookingSlots);

    // Dynamic time slots - Edit form
    const editTrainerSel = document.getElementById('editTrainerSelect');
    const editDateInput = document.getElementById('editAppointmentDate');
    const editTimeSel = document.getElementById('editAppointmentTime');

    const reloadEditSlots = () => loadTrainerSlots(editTrainerSel?.value, editDateInput?.value, editTimeSel);
    editTrainerSel?.addEventListener('change', reloadEditSlots);
    editDateInput?.addEventListener('change', reloadEditSlots);

    // Refresh button
    document.getElementById('refreshAppointments')?.addEventListener('click', loadAppointments);

    // Edit from view modal
    document.getElementById('editAppointmentBtn')?.addEventListener('click', () => {
        if (currentViewAppointmentId) editAppointment(currentViewAppointmentId);
    });
});