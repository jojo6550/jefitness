# Fix Cart Duplicate Key Error

## Tasks
- [x] Update Cart model: Change field from "user" to "userId"
- [x] Update cart routes: Replace all "user" with "userId" in queries
- [x] Add validation in cart routes to ensure req.user.id is present
- [x] Test the fix - Server starts without errors
