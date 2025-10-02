# TODO: Enable Users to Delete Appointments

## Tasks
- [x] Update `src/routes/appointments.js`: Modify DELETE route to allow clients to delete their own appointments and adjust logging for client deletions.
- [x] Update `public/js/appointments.js`: Change "Cancel" button to "Delete", replace cancelAppointment function with deleteAppointment using DELETE method, and update confirmation message.

## Followup Steps
- [x] Test deletion functionality from the frontend.
- [x] Verify that deleted appointments are removed from the database and no longer appear in the UI.
