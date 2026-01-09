const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getFileHash, getVersionParam, versionedUrl, invalidateCache } = require('../../src/utils/cacheVersion');

// Mock fs module
jest.mock('fs');

describe('Cache Version Utility', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset the hash cache
    invalidateCache();
  });

  describe('getFileHash', () => {
    test('should return hash for existing file', () => {
      const mockContent = 'console.log("test");';
      const expectedHash = 'd41d8cd98f00b204e9800998ecf8427e'; // MD5 of empty string

      // Mock fs.existsSync to return true
      fs.existsSync.mockReturnValue(true);
      // Mock fs.readFileSync to return file content
      fs.readFileSync.mockReturnValue(mockContent);
      // Mock crypto.createHash
      const mockDigest = jest.fn().mockReturnValue(expectedHash);
      const mockUpdate = jest.fn().mockReturnThis();
      const mockCreateHash = jest.fn(() => ({
        update: mockUpdate,
        digest: mockDigest
      }));

      // Mock the crypto module
      jest.spyOn(crypto, 'createHash').mockImplementation(mockCreateHash);

      const result = getFileHash('js/app.js');
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(process.cwd(), 'public', 'js/app.js'));
      expect(fs.readFileSync).toHaveBeenCalledWith(path.join(process.cwd(), 'public', 'js/app.js'));
      expect(crypto.createHash).toHaveBeenCalledWith('md5');
      expect(mockUpdate).toHaveBeenCalledWith(mockContent);
      expect(result).toBe(expectedHash.substring(0, 8));

      // Restore crypto
      crypto.createHash.mockRestore();
    });

    test('should return timestamp fallback for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = getFileHash('nonexistent.js');
      expect(result).toMatch(/^[a-z0-9]+$/); // Should be a base36 string
    });

    test('should cache hash results', () => {
      const mockContent = 'console.log("cached");';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      // First call
      const result1 = getFileHash('js/cached.js');
      // Second call should use cache
      const result2 = getFileHash('js/cached.js');

      expect(fs.readFileSync).toHaveBeenCalledTimes(1); // Only called once due to caching
      expect(result1).toBe(result2);
    });

    test('should handle file read errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const result = getFileHash('js/error.js');
      expect(result).toMatch(/^[a-z0-9]+$/); // Should return timestamp fallback
    });
  });

  describe('getVersionParam', () => {
    test('should return version parameter with hash', () => {
      const mockContent = 'test content';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = getVersionParam('styles/main.css');
      expect(result).toMatch(/\?v=[a-f0-9]+/);
    });
  });

  describe('versionedUrl', () => {
    test('should add version parameter to relative URLs', () => {
      const mockContent = 'css content';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = versionedUrl('/styles/main.css');
      expect(result).toMatch(/^\/styles\/main\.css\?v=[a-f0-9]+$/);
    });

    test('should not modify external URLs', () => {
      const externalUrl = 'https://cdn.example.com/style.css';
      const result = versionedUrl(externalUrl);
      expect(result).toBe(externalUrl);
    });

    test('should handle URLs without leading slash', () => {
      const mockContent = 'js content';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = versionedUrl('js/app.js');
      expect(result).toMatch(/^js\/app\.js\?v=[a-f0-9]+$/);
    });
  });

  describe('invalidateCache', () => {
    test('should clear hash cache', () => {
      const mockContent = 'cached content';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      // First call caches the result
      getFileHash('js/cache.js');
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);

      // Invalidate cache
      invalidateCache();

      // Second call should read file again
      getFileHash('js/cache.js');
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with real files', () => {
    test('should handle real public directory files', () => {
      // Test with a file that actually exists in the public directory
      const realFile = 'index.html';

      // This should not throw an error
      expect(() => {
        getFileHash(realFile);
        getVersionParam(realFile);
        versionedUrl(realFile);
      }).not.toThrow();
    });
  });
});
