(function () {
  const { state, authFetch, showConfirm } = window.ApptShared;

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

  function attachCreateListener() {
    document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
      e.preventDefault();

      if (!state.userSubscriptionStatus) {
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
            window.ApptList.loadAppointments();
            window.Toast?.success?.('Appointment booked successfully!') || alert('Appointment booked successfully!');
          } catch (innerErr) {
            console.error('Error creating appointment:', innerErr);
            let errorMsg = innerErr.message || 'Failed to create appointment.';
            if (errorMsg.startsWith('HTTP 400 - ')) {
              try {
                const jsonStr = errorMsg.replace('HTTP 400 - ', '');
                const parsed = JSON.parse(jsonStr);
                errorMsg = parsed.msg || parsed.error || errorMsg;
              } catch (e) {
                // keep original
              }
            }
            window.Toast?.error?.(errorMsg) || alert(errorMsg);
          }
        });
      } catch (err) {
        console.error('Error in form submission:', err);
      }
    });
  }

  window.ApptBooking = { loadTrainersInto, loadTrainerSlots, attachCreateListener };
})();
