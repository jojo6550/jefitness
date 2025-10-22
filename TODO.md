# Fix Appointment Maker Issues

## Steps to Complete:
- [x] Update src/routes/users.js to include all admin users in trainer list (remove exclusion of 'admin' 'admin')
- [x] Update src/routes/appointments.js to fix time slot logic - change from sliding 1-hour window to fixed hour blocks (e.g., 14:00-15:00)
- [ ] Test trainer population in meet-your-trainer.html
- [ ] Test appointment booking functionality

## Details:
- Trainer list was excluding default admin accounts, causing empty dropdown
- Time slot limit was using sliding windows instead of fixed hours, making it too restrictive
- Need to ensure bookings work after fixes
