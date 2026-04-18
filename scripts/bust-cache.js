#!/usr/bin/env node
/**
 * Cache buster — appends ?v=<git-hash> to every local JS/CSS asset
 * in public/pages/*.html. Run before every deploy.
 *
 * Usage:
 *   npm run cache:bust
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Version string ────────────────────────────────────────────────────────────
function getVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    // Not a git repo or git not available — fall back to timestamp
    return Date.now().toString(36);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGES_DIR = path.join(__dirname, '..', 'public', 'pages');

// Matches local src/href values — skips CDN URLs (http/https//)
const ASSET_RE =
  /(<(?:script|link)[^>]*?\s(?:src|href))="((?!https?:\/\/|\/\/)[^"]+\.(js|css))(\?[^"]*)?"([^>]*>)/g;

function stampFile(filePath, version) {
  const original = fs.readFileSync(filePath, 'utf8');
  const stamped = original.replace(ASSET_RE, (_, tag, assetPath, _ext, _qs, rest) => {
    return `${tag}="${assetPath}?v=${version}"${rest}`;
  });

  if (stamped === original) return false;
  fs.writeFileSync(filePath, stamped, 'utf8');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const version = getVersion();
const htmlFiles = [
  path.join(__dirname, '..', 'public', 'index.html'),
  ...fs
    .readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(PAGES_DIR, f)),
];

let updated = 0;
for (const file of htmlFiles) {
  if (stampFile(file, version)) {
    console.log(`  stamped  ${path.basename(file)}`);
    updated++;
  } else {
    console.log(`  skipped  ${path.basename(file)}  (no local assets found)`);
  }
}

// ── Bump SW cache version ─────────────────────────────────────────────────────
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const swContent = fs.readFileSync(swPath, 'utf8');
const newSwContent = swContent
  .replace(
    /\/\/ ={15,}\n\/\/JEFitness Service Worker \(v\d+\)/,
    `// ===============================\n//JEFitness Service Worker (v${version})`
  )
  .replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`);
if (newSwContent !== swContent) {
  fs.writeFileSync(swPath, newSwContent, 'utf8');
  console.log(`  stamped  sw.js  (CACHE_VERSION=${version})`);
}

console.log(
  `\ncache bust complete — v=${version} — ${updated}/${htmlFiles.length} files updated`
);
