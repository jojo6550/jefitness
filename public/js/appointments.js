window.API_BASE = window.ApiConfig?.getAPI_BASE?.() || '';

if (window.API_BASE?.startsWith('https://localhost')) {
  console.warn('SSL Fix: Converting HTTPS localhost → HTTP backend');
  window.API_BASE = window.API_BASE.replace(/^https:/, 'http:');
}

document.addEventListener('DOMContentLoaded', async () => {
  window.ApptEdit.initEditModal();
  window.ApptBooking.attachCreateListener();
  window.ApptEdit.attachSaveListener();

  const hasSubscription = await window.ApptShared.checkSubscriptionStatus();

  const subscriptionLock = document.getElementById('subscriptionLock');
  if (subscriptionLock) subscriptionLock.classList.toggle('d-none', hasSubscription);

  document.querySelectorAll('[data-bs-target="#bookingModal"]').forEach(btn => {
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

  if (hasSubscription) {
    const trainerSelect = document.getElementById('trainerSelect');
    if (trainerSelect) await window.ApptBooking.loadTrainersInto(trainerSelect);
    await window.ApptList.loadAppointments();
  }

  const today = new Date().toISOString().split('T')[0];
  ['appointmentDate', 'editAppointmentDate'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.min = today;
  });

  const bookingTrainerSel = document.getElementById('trainerSelect');
  const bookingDateInput = document.getElementById('appointmentDate');
  const bookingTimeSel = document.getElementById('appointmentTime');
  const reloadBookingSlots = () => window.ApptBooking.loadTrainerSlots(bookingTrainerSel?.value, bookingDateInput?.value, bookingTimeSel);
  bookingTrainerSel?.addEventListener('change', reloadBookingSlots);
  bookingDateInput?.addEventListener('change', reloadBookingSlots);

  const editTrainerSel = document.getElementById('editTrainerSelect');
  const editDateInput = document.getElementById('editAppointmentDate');
  const editTimeSel = document.getElementById('editAppointmentTime');
  const reloadEditSlots = () => window.ApptBooking.loadTrainerSlots(editTrainerSel?.value, editDateInput?.value, editTimeSel);
  editTrainerSel?.addEventListener('change', reloadEditSlots);
  editDateInput?.addEventListener('change', reloadEditSlots);

  document.getElementById('refreshAppointments')?.addEventListener('click', window.ApptList.loadAppointments);

  document.getElementById('editAppointmentBtn')?.addEventListener('click', () => {
    if (window.ApptShared.state.currentViewAppointmentId) {
      window.ApptEdit.editAppointment(window.ApptShared.state.currentViewAppointmentId);
    }
  });
});
