# TODO: Fix PWA Errors and Paths

## Issues Identified
- Service Worker registration failing due to incorrect path (/sw.js instead of /public/sw.js)
- Manifest icon paths missing /public/ prefix
- Service Worker cache assets missing /public/ prefix
- Placeholder images in index.html failing (external URLs)
- Favicon 404 due to path issues

## Tasks
- [x] Update service worker registration path in public/js/app.js
- [x] Update manifest.json icon paths to include ./
- [x] Update STATIC_ASSETS in public/sw.js to include favicons and images
- [x] Replace placeholder images in public/index.html with local images
- [ ] Test PWA functionality after changes

## Followup Steps
- Run the development server and verify no 404 errors
- Check service worker registration in browser dev tools
- Verify manifest icons load correctly
- Ensure images display properly
