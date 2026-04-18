(function () {
  const { state, authFetch, showConfirm } = window.ApptShared;

  let editModal = null;

  function initEditModal() {
    const editModalEl = document.getElementById('editAppointmentModal');
    editModal = new bootstrap.Modal(editModalEl || document.createElement('div'));

    if (editModalEl) {
      editModalEl.addEventListener('hidden.bs.modal', () => {
        document.activeElement?.blur();
      });
    }
  }

  async function editAppointment(id) {
    try {
      state.currentEditAppointmentId = id;
      const app = await authFetch(`${window.API_BASE}/api/v1/appointments/${id}`);

      const editDateVal = new Date(app.date).toISOString().slice(0, 10);

      document.getElementById('editAppointmentDate').value = editDateVal;
      document.getElementById('editAppointmentNotes').value = app.notes || '';

      await window.ApptBooking.loadTrainersInto(document.getElementById('editTrainerSelect'), app.trainerId?._id);

      const editTimeSel = document.getElementById('editAppointmentTime');
      await window.ApptBooking.loadTrainerSlots(app.trainerId?._id, editDateVal, editTimeSel);
      editTimeSel.value = app.time || '';

      editModal.show();
    } catch (err) {
      console.error('Error editing appointment:', err);
      window.Toast?.error?.('Failed to load appointment for editing.') || alert('Failed to load appointment for editing.');
    }
  }

  function attachSaveListener() {
    document.getElementById('editAppointmentForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!state.currentEditAppointmentId) return;

      try {
        const payload = {
          date: document.getElementById('editAppointmentDate').value,
          time: document.getElementById('editAppointmentTime').value,
          notes: document.getElementById('editAppointmentNotes').value,
          trainerId: document.getElementById('editTrainerSelect').value
        };

        await authFetch(`${window.API_BASE}/api/v1/appointments/${state.currentEditAppointmentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        editModal.hide();
        window.ApptList.loadAppointments();
        window.Toast?.success?.('Appointment updated successfully.') || alert('Appointment updated successfully.');
      } catch (err) {
        console.error('Error updating appointment:', err);
        window.Toast?.error?.('Failed to update appointment.') || alert('Failed to update appointment.');
      }
    });
  }

  async function deleteAppointment(id) {
    showConfirm('Are you sure you want to delete this appointment?', async () => {
      try {
        await authFetch(`${window.API_BASE}/api/v1/appointments/${id}`, { method: 'DELETE' });
        window.ApptList.loadAppointments();
        window.Toast?.success?.('Appointment deleted successfully.') || alert('Appointment deleted successfully.');
      } catch (err) {
        console.error('Error deleting appointment:', err);
        window.Toast?.error?.('Failed to delete appointment.') || alert('Failed to delete appointment.');
      }
    });
  }

  window.ApptEdit = { initEditModal, editAppointment, attachSaveListener, deleteAppointment };
})();
