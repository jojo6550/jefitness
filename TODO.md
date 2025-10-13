# Medical Information Upload Feature

## Pending Tasks
- [x] Update User.js: Add medicalFiles array field with filename, data (Buffer), mimetype, uploadedAt
- [x] Update profile.html: Add a new "Medical Information" section with file input for multiple files
- [x] Update profile.js: Add file upload handling using FormData to a new POST /api/auth/medical route
- [x] Update auth.js: Add POST /api/auth/medical for uploading files and GET /api/auth/medical/:userId/:filename for downloading
- [ ] Update admin-dashboard.html: Add medical files section in user details modal with download links
- [ ] Update admin-dashboard.js: Modify showUserDetails to display medical files list with download buttons

## Followup Steps
- [ ] Test file upload from profile
- [ ] Test download from admin modal
- [ ] Ensure proper error handling and security
