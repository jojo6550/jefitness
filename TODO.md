# TODO: Disable Browser Caching in Development

- [x] Add global middleware in server.js to disable caching for all routes when NODE_ENV !== 'production'
- [x] Modify express.static() in server.js to set no-cache headers for .html, .js, .css files in development
- [x] Restart the server after changes
