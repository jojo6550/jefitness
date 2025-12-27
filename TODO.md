# Database Issues Resolution TODO

## 1. Enhance Mongoose Validation
- [x] Update User.js: Add password strength, phone regex, date validations, etc.
- [x] Update Program.js: Ensure price > 0, add duration enum or regex.
- [ ] Update Order.js: Ensure prices > 0, add billing validations.
- [ ] Update Appointment.js: Add date/time validations.
- [ ] Update other models (Cart.js, Log.js, Notification.js): Add missing validations.

## 2. Implement Connection Retry Logic
- [ ] Update config/db.js: Add exponential backoff for MongoDB connections.

## 3. Create Backup Strategy
- [ ] Create scripts/backup.js: Automated backups using mongodump.

## 4. Expand Data Migration Scripts
- [ ] Create scripts/migrate.js: General migration framework.

## 5. Add Database Seeding
- [ ] Enhance src/seedPrograms.js to seed all models.
- [ ] Create scripts/seed.js for comprehensive seeding.

## 6. Implement Monitoring
- [ ] Update src/server.js: Add slow query logging and monitoring hooks.

## 7. Data Archiving Strategy
- [ ] Create scripts/archive.js: Archive old records (logs, orders).

## 8. Referential Integrity
- [ ] Add pre-save hooks and transactions in models to enforce relationships.
