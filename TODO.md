# TODO: Disable Browser Caching in Development

- [x] Add global middleware in server.js to disable caching for all routes when NODE_ENV !== 'production'
- [x] Modify express.static() in server.js to set no-cache headers for .html, .js, .css files in development
- [x] Restart the server after changes
- [x] Fix subscription display issues ($NaN, Invalid Date) in frontend JavaScript
- [x] Update API response to return correct field names from User model
- [x] Fix JavaScript errors (undefined toUpperCase, pricing display issues)
- [x] Add better error handling and logging for subscription display
- [x] Add CSS styling for subscription cards when user has active subscription (created public/styles/subscription-cards.css and linked to subscriptions.html)
