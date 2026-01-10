# TODO: Link Chat Feature to Admin and Trainer IDs

## Backend Changes
- [ ] Fix `/api/users/trainers` endpoint to fetch users with 'trainer' role instead of 'admin'
- [ ] Add new `/api/users/admins` endpoint to fetch users with 'admin' role

## Frontend Changes
- [ ] Update `chat.js` to fetch real trainers and admins from API endpoints
- [ ] Modify `buildProfileCards()` to dynamically create cards based on fetched data
- [ ] Ensure roles are displayed correctly (Admin/Trainer) based on email roles

## Testing
- [ ] Test chat functionality with real user data
- [ ] Verify role-based listing works correctly
