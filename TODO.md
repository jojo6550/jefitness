# Chat Feature Implementation TODO

## Backend Setup
- [x] Add WebSocket server in src/server.js
- [x] Create src/routes/chat.js for chat API endpoints
- [x] Implement message limiting logic (3 messages max until reply)
- [x] Add chat action logging

## Frontend Implementation
- [x] Create chat widget HTML (public/pages/partials/chat-widget.html)
- [x] Create public/js/chat.js for widget functionality
- [x] Create public/styles/chat.css for styling
- [x] Extend public/js/websocket.js for chat messages

## Testing
- [x] Create unit tests for chat routes
- [x] Create unit tests for message limiting logic
- [x] Update websocket tests for chat functionality

## Integration & Testing
- [ ] Test WebSocket connection and message sending
- [ ] Verify message limiting works
- [ ] Check logging of actions
- [ ] Ensure UI is responsive and positioned correctly
