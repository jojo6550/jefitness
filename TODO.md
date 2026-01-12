# Debugging Fixes TODO

## Static File Serving (404 navbar)
- [ ] Update navbar-loader.js to use absolute path '/pages/partials/navbar.html' instead of relative

## API Connection Refused Errors
- [ ] Update api.config.js to use window.location.origin for dynamic base URL resolution
- [ ] Remove hardcoded localhost:5001

## WebSocket Reconnect Loop
- [ ] Update websocket.js to use window.location.origin for WebSocket URL
- [ ] Add backend availability check before reconnecting
- [ ] Implement exponential backoff for reconnections

## Environment Configuration
- [ ] Ensure frontend and backend environments align (use same port dynamically)

## Backend Health Check
- [ ] Add /api/health endpoint in server.js for verification

## Defensive Frontend Behavior
- [ ] Add user-friendly handling when backend is unavailable
- [ ] Prevent repeated failed API calls from spamming logs
