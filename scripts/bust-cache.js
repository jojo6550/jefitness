#!/usr/bin/env node

/**
 * Cache Bust Script
 * 
 * Usage: npm run cache:bust
 * 
 * This script helps you manually bust the cache by incrementing
 * the CACHE_VERSION in public/sw.js
 */

const fs = require('fs');
const path = require('path');

const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js');

try {
  // Read service worker file
  let swContent = fs.readFileSync(SW_PATH, 'utf-8');

  // Find current CACHE_VERSION
  const versionMatch = swContent.match(/const CACHE_VERSION = '(\d+)'/);
  if (!versionMatch) {
    console.error('❌ Could not find CACHE_VERSION in sw.js');
    process.exit(1);
  }

  const currentVersion = parseInt(versionMatch[1]);
  const newVersion = currentVersion + 1;

  // Update CACHE_VERSION
  swContent = swContent.replace(
    /const CACHE_VERSION = '\d+'/,
    `const CACHE_VERSION = '${newVersion}'`
  );

  // Write back
  fs.writeFileSync(SW_PATH, swContent);

  console.log('✅ Cache busted successfully!');
  console.log(`   CACHE_VERSION: ${currentVersion} → ${newVersion}`);
  console.log('   Old caches will be cleared on next user visit');
  console.log('   Make sure to deploy this change to production');
} catch (err) {
  console.error('❌ Error busting cache:', err.message);
  process.exit(1);
}