/**
 * Cache Control Middleware
 * Sets appropriate cache headers for different asset types
 */

const cacheControl = (req, res, next) => {
  const { path } = req;

  // HTML files: No cache (always fetch fresh)
  if (path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return next();
  }

  // CSS & JS files: Cache for 1 month (will be cache-busted by version param)
  if (path.endsWith('.css') || path.endsWith('.js')) {
    res.set('Cache-Control', 'public, max-age=2592000'); // 30 days
    return next();
  }

  // Images: Cache for 1 year (they rarely change)
  if (/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i.test(path)) {
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
    return next();
  }

  // Fonts: Cache for 1 year
  if (/\.(woff|woff2|ttf|otf|eot)$/i.test(path)) {
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
    return next();
  }

  // Service worker: No cache (always check for updates)
  if (path === '/sw.js') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Service-Worker-Allowed', '/');
    return next();
  }

  // Manifest: No cache
  if (path.endsWith('manifest.json')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return next();
  }

  // Default: No cache
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
};

module.exports = cacheControl;