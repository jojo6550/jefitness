# Cache Busting Improvements

## Current Issues
- Client-side cache-version.js uses hourly timestamps instead of file content hashes
- Server-side file hashing utility exists but is unused
- No automatic cache busting on file changes
- Service worker requires manual version increments

## Improvement Plan
- [x] Integrate file-based hashing: Modify cache-version.js to fetch actual file hashes from server
- [x] Create version API endpoint: Add `/api/cache-versions` to serve file hashes
- [x] Server-side version injection: Add middleware to inject versions in HTML responses
- [x] Dynamic service worker versioning: Make SW version based on file changes
- [x] Cache invalidation on restart: Clear hash cache when server starts
- [x] Update documentation: Update CACHE_BUSTING_GUIDE.md

## Files to Modify
- `public/js/cache-version.js` - Use server-provided hashes
- `src/server.js` - Add version endpoint and injection middleware
- `src/utils/cacheVersion.js` - Integrate into server
- `public/sw.js` - Dynamic versioning
- `CACHE_BUSTING_GUIDE.md` - Update documentation
