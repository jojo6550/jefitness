const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getFileHash } = require('../utils/cacheVersion');

/**
 * GET /api/cache-versions
 * Returns version hashes for all static assets
 * Used by client-side cache busting
 */
router.get('/cache-versions', async (req, res) => {
  try {
    const publicDir = path.join(process.cwd(), 'public');

    // Define asset directories and file extensions to version
    const assetDirs = ['js', 'styles'];
    const extensions = ['.js', '.css'];

    const versions = {};

    // Recursively scan asset directories
    function scanDirectory(dirPath, relativePath = '') {
      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const itemRelativePath = path.join(relativePath, item).replace(/\\/g, '/');
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            // Recurse into subdirectories
            scanDirectory(itemPath, itemRelativePath);
          } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (extensions.includes(ext)) {
              // Get hash for this file
              const hash = getFileHash(itemRelativePath);
              versions[itemRelativePath] = hash;
            }
          }
        }
      } catch (error) {
        console.warn(`Warning scanning directory ${dirPath}:`, error.message);
      }
    }

    // Scan each asset directory
    for (const dir of assetDirs) {
      const dirPath = path.join(publicDir, dir);
      if (fs.existsSync(dirPath)) {
        scanDirectory(dirPath, dir);
      }
    }

    // Add version for service worker and manifest
    const specialFiles = ['sw.js', 'manifest.json'];
    for (const file of specialFiles) {
      const filePath = path.join(publicDir, file);
      if (fs.existsSync(filePath)) {
        versions[file] = getFileHash(file);
      }
    }

    res.json({
      success: true,
      versions,
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development'
    });

  } catch (error) {
    console.error('Error generating cache versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cache versions',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/cache-diagnostics
 * Diagnostic endpoint for cache troubleshooting
 */
router.get('/cache-diagnostics', (req, res) => {
  res.json({
    success: true,
    diagnostics: {
      environment: process.env.NODE_ENV || 'development',
      cacheService: 'in-memory',
      cacheVersionUtility: 'available',
      serviceWorker: 'enabled',
      timestamp: Date.now()
    },
    headers: {
      'Cache-Control': res.get('Cache-Control') || 'not set',
      'Service-Worker-Allowed': res.get('Service-Worker-Allowed') || 'not set'
    }
  });
});

module.exports = router;
