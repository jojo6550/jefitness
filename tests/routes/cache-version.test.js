const request = require('supertest');
const express = require('express');
const { getFileHash } = require('../../src/utils/cacheVersion');

// Create a test app
const app = express();
app.use(express.json());

// Test routes - simplified version for testing
app.get('/api/cache-versions', (req, res) => {
  const staticAssets = [
    'index.html',
    'styles/styles.css',
    'js/app.js'
  ];

  const versions = {};
  staticAssets.forEach(asset => {
    versions[asset] = getFileHash(asset);
  });

  res.json(versions);
});

app.get('/api/cache-version', (req, res) => {
  const staticAssets = [
    'index.html',
    'styles/styles.css',
    'js/app.js'
  ];

  // Create a combined hash of all asset hashes
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  staticAssets.forEach(asset => {
    hash.update(getFileHash(asset));
  });

  res.json({ version: hash.digest('hex').substring(0, 8) });
});

describe('Cache Version API', () => {
  describe('GET /api/cache-versions', () => {
    test('should return version hashes for static assets', async () => {
      const response = await request(app)
        .get('/api/cache-versions')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(typeof response.body).toBe('object');
      expect(response.body).toHaveProperty('index.html');
      expect(response.body).toHaveProperty('js/app.js');
      expect(response.body).toHaveProperty('styles/styles.css');

      // Check that values are strings (hashes)
      Object.values(response.body).forEach(hash => {
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
      });
    });

    test('should return consistent hashes for same files', async () => {
      const response1 = await request(app)
        .get('/api/cache-versions')
        .expect(200);

      const response2 = await request(app)
        .get('/api/cache-versions')
        .expect(200);

      expect(response1.body).toEqual(response2.body);
    });
  });

  describe('GET /api/cache-version', () => {
    test('should return a single combined version hash', async () => {
      const response = await request(app)
        .get('/api/cache-version')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body).toHaveProperty('version');
      expect(typeof response.body.version).toBe('string');
      expect(response.body.version.length).toBe(8); // 8 character hash
      expect(response.body.version).toMatch(/^[a-f0-9]+$/); // Hex characters only
    });

    test('should return consistent version hash', async () => {
      const response1 = await request(app)
        .get('/api/cache-version')
        .expect(200);

      const response2 = await request(app)
        .get('/api/cache-version')
        .expect(200);

      expect(response1.body.version).toBe(response2.body.version);
    });
  });
});
