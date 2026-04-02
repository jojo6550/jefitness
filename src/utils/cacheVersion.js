const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../services/logger');

/**
 * Cache Version Utility
 * Generates file hashes for cache busting
 */

// Cache for computed hashes to avoid recomputation
const hashCache = new Map();

// Map to store file watchers
const watchers = new Map();

/**
 * Get file hash for cache busting
 * @param {string} filePath - Relative path from public folder
 * @returns {string} Short hash of file contents
 */
function getFileHash(filePath) {
  try {
    // Return cached hash if available
    if (hashCache.has(filePath)) {
      return hashCache.get(filePath);
    }

    const fullPath = path.join(process.cwd(), 'public', filePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      logger.warn('Cache version: file not found', { filePath });
      return Date.now().toString(36);
    }

    const fileContent = fs.readFileSync(fullPath);
    const hash = crypto
      .createHash('md5')
      .update(fileContent)
      .digest('hex')
      .substring(0, 8);

    // Cache the hash
    hashCache.set(filePath, hash);
    return hash;
  } catch (err) {
    logger.error('Error computing file hash', { filePath, error: err.message });
    return Date.now().toString(36);
  }
}

/**
 * Get version string for asset
 * @param {string} filePath - Relative path from public folder
 * @returns {string} Version query parameter (e.g., "?v=abc12345")
 */
function getVersionParam(filePath) {
  const hash = getFileHash(filePath);
  return `?v=${hash}`;
}

/**
 * Inject version into asset URL
 * @param {string} url - Asset URL
 * @returns {string} URL with version parameter
 */
function versionedUrl(url) {
  // Do not modify external URLs
  if (url.match(/^https?:\/\//)) {
    return url;
  }

  // For relative URLs, extract path and add versioning
  const urlObj = new URL(url, 'http://localhost');
  const pathname = urlObj.pathname;
  const cleanPath = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  return url + getVersionParam(cleanPath);
}

/**
 * Invalidate cache (clear hash cache)
 * Used when files are updated
 */
function invalidateCache() {
  hashCache.clear();
}

/**
 * Start watching asset directories for changes (development only)
 * @param {function} callback - Function to call when files change
 */
function startFileWatching(callback) {
  // Only watch in development
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const publicDir = path.join(process.cwd(), 'public');
  const assetDirs = ['js', 'styles'];

  assetDirs.forEach(dir => {
    const dirPath = path.join(publicDir, dir);

    if (fs.existsSync(dirPath)) {
      try {
        const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
          if (filename && (filename.endsWith('.js') || filename.endsWith('.css'))) {
            logger.info('Cache invalidated due to file change', { filename });
            invalidateCache();
            if (callback) callback(filename);
          }
        });

        watchers.set(dir, watcher);
        logger.info('Cache watcher started', { dir });
      } catch (error) {
        logger.warn('Failed to start cache watcher', { dir, error: error.message });
      }
    }
  });
}

/**
 * Stop file watching
 */
function stopFileWatching() {
  watchers.forEach((watcher, dir) => {
    watcher.close();
    logger.info('Cache watcher stopped', { dir });
  });
  watchers.clear();
}

module.exports = {
  getFileHash,
  getVersionParam,
  versionedUrl,
  invalidateCache,
  startFileWatching,
  stopFileWatching,
};
