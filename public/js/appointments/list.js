(function () {
  const { state, escapeHtml, authFetch, showError } = window.ApptShared;

  async function loadAppointments() {
    if (!state.userSubscriptionStatus) {
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

    tbody.querySelectorAll('.edit-btn').forEach(btn =>
      btn.addEventListener('click', () => window.ApptEdit.editAppointment(btn.dataset.id))
    );

    tbody.querySelectorAll('.delete-btn').forEach(btn =>
      btn.addEventListener('click', () => window.ApptEdit.deleteAppointment(btn.dataset.id))
    );
  }

  async function viewAppointment(id) {
    try {
      state.currentViewAppointmentId = id;
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

  window.ApptList = { loadAppointments, displayAppointments, viewAppointment };
})();
