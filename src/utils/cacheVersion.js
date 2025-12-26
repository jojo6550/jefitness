const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Cache Version Utility
 * Generates file hashes for cache busting
 */

// Cache for computed hashes to avoid recomputation
const hashCache = new Map();

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
      console.warn(`Cache version: File not found: ${filePath}`);
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
    console.error(`Error computing hash for ${filePath}:`, err.message);
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
  // Extract path from URL
  const urlObj = new URL(url, 'http://localhost');
  const pathname = urlObj.pathname;
  
  // Only version local assets
  if (pathname.startsWith('/')) {
    const cleanPath = pathname.substring(1); // Remove leading slash
    return pathname + getVersionParam(cleanPath);
  }
  
  return url;
}

/**
 * Invalidate cache (clear hash cache)
 * Used when files are updated
 */
function invalidateCache() {
  hashCache.clear();
}

module.exports = {
  getFileHash,
  getVersionParam,
  versionedUrl,
  invalidateCache
};