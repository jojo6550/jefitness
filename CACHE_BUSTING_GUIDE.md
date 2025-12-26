# Cache Busting Implementation Guide

## Overview
Cache busting prevents users from seeing stale CSS, JS, and other assets when you update your website. This implementation uses multiple strategies to ensure fresh assets are loaded without requiring hard reloads (Ctrl+Shift+R).

## How It Works

### 1. **Server-side Cache Control Headers** (`src/middleware/cacheControl.js`)
The Express middleware sets appropriate cache headers for different file types:

- **HTML files**: `no-cache, no-store, must-revalidate` - Always fetches fresh
- **CSS/JS files**: `max-age=2592000` (30 days) - Cached but will be busted by version params
- **Images/Fonts**: `max-age=31536000` (1 year) - Long-term caching
- **Service Worker**: `no-cache` - Always checks for updates

### 2. **Client-side Version Injection** (`public/js/cache-version.js`)
A JavaScript utility that automatically adds version parameters to all local assets:

```html
<!-- Before: -->
<link rel="stylesheet" href="./styles/styles.css">
<script src="./js/app.js"></script>

<!-- After (automatic): -->
<link rel="stylesheet" href="./styles/styles.css?v=abc12345">
<script src="./js/app.js?v=def67890"></script>
```

The version parameter changes based on:
- **In development**: Updated every hour (ensures cache bust at least hourly)
- **In production**: Should be set via the `app-version` meta tag to match your build hash

### 3. **Service Worker Cache Versioning** (`public/sw.js`)
The service worker automatically manages cache versions:

```javascript
const CACHE_VERSION = '3';  // Increment this to force cache clear
const STATIC_CACHE = `jefitness-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `jefitness-dynamic-v${CACHE_VERSION}`;
```

When you increment `CACHE_VERSION`, the service worker will delete old caches and create new ones.

## Usage

### For Developers

#### Option 1: Automatic (Recommended)
Just make changes to your CSS/JS files. The client-side version injector will automatically add version parameters, ensuring fresh assets without hard reload.

#### Option 2: Manual Cache Invalidation
When you make significant changes and want to ensure immediate cache bust across all users:

```javascript
// In public/sw.js, increment the CACHE_VERSION
const CACHE_VERSION = '4';  // Changed from '3'
```

This will:
1. Force browsers to download a new service worker
2. Delete old cached versions
3. Re-cache all static assets

#### Option 3: Server Restart
Simply restart your server (e.g., `npm start`). The version parameter is based on timestamps, so a new session will get fresh assets.

### Setting App Version in Production
If you have a build system that generates hashes, update the meta tag:

```html
<!-- In your HTML header -->
<meta name="app-version" content="build-hash-123456">
```

The `cache-version.js` script will automatically use this value for all versioned assets.

## File Structure
```
public/
├── js/
│   ├── cache-version.js          # ← Automatic version injector
│   ├── app.js
│   └── ...other scripts
├── styles/
│   └── styles.css
└── index.html

src/
├── middleware/
│   ├── cacheControl.js            # ← Cache header middleware
│   └── ...other middleware
└── server.js                       # ← Uses cacheControl middleware
```

## Verification

### Check Cache Headers
1. Open DevTools (F12)
2. Go to Network tab
3. Load a CSS/JS file
4. Check the Response Headers for `Cache-Control`

### Check Version Parameters
1. Open DevTools
2. Go to Network tab
3. Look for query parameters like `?v=abc12345` on stylesheets and scripts

### Check Service Worker
1. Open DevTools
2. Go to Application → Service Workers
3. You should see cache entries like `jefitness-static-v3`

## Troubleshooting

### Still seeing old CSS/JS?
1. **Check DevTools Settings**: Ensure "Disable cache (while DevTools is open)" is NOT checked
2. **Hard Refresh**: Press Ctrl+Shift+R (Cmd+Shift+R on Mac) to bypass cache
3. **Clear Service Worker Cache**:
   - DevTools → Application → Service Workers
   - Click "Unregister"
   - Refresh the page

### CSS/JS not updating on other users' browsers?
1. Increment `CACHE_VERSION` in `public/sw.js`
2. Deploy your changes
3. Users' service workers will auto-update within 24 hours
4. Or: Users can hard refresh (Ctrl+Shift+R)

### Dynamic assets not versioning?
The `cache-version.js` script watches for dynamically added assets. If scripts/styles are added after page load, they should still be automatically versioned.

## Best Practices

1. **Always use relative paths**: `./styles/styles.css` not `/styles/styles.css`
2. **Avoid external CDN caching issues**: Use absolute URLs for CDN assets
3. **Update app-version meta tag**: In production, tie this to your build/release process
4. **Test with DevTools throttling**: Simulate slow networks to ensure caching works properly
5. **Monitor cache sizes**: Occasionally increment `CACHE_VERSION` to clean up old caches

## Performance Impact

✅ **Positive:**
- Users only download changed assets
- First-time users get full caching benefit
- Reduced bandwidth usage

✅ **Trade-offs:**
- Query parameters in URLs (minimal impact)
- Client-side version generation (negligible JS overhead)
- Multiple cache versions temporarily (cleaned up automatically)

## Related Files
- `src/middleware/cacheControl.js` - Cache header configuration
- `public/js/cache-version.js` - Client-side version injection
- `public/sw.js` - Service worker with cache versioning
- `public/index.html` - App version meta tag