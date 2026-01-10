const monitoringService = require('../../src/services/monitoring');

describe('Monitoring Service Memory Management', () => {
  let originalGc;

  beforeAll(() => {
    // Store original gc function
    originalGc = global.gc;
  });

  afterAll(() => {
    // Restore original gc function
    global.gc = originalGc;
  });

  beforeEach(() => {
    // Reset monitoring service metrics before each test
    monitoringService.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      systemLoad: [1, 1, 1]
    };
  });

  describe('performMemoryCleanup', () => {
    it('should trigger garbage collection when available', () => {
      // Mock global.gc
      let gcCalled = false;
      global.gc = jest.fn(() => {
        gcCalled = true;
      });

      monitoringService.performMemoryCleanup();

      expect(gcCalled).toBe(true);
      expect(global.gc).toHaveBeenCalled();
    });

    it('should handle missing garbage collection gracefully', () => {
      // Remove global.gc
      delete global.gc;

      expect(() => {
        monitoringService.performMemoryCleanup();
      }).not.toThrow();
    });

    it('should trim response times array when it exceeds 500 entries', () => {
      // Add more than 500 response times
      const responseTimes = Array.from({ length: 600 }, (_, i) => i);
      monitoringService.metrics.responseTimes = responseTimes;

      monitoringService.performMemoryCleanup();

      expect(monitoringService.metrics.responseTimes.length).toBeLessThanOrEqual(500);
      expect(monitoringService.metrics.responseTimes.length).toBe(500);
    });

    it('should not trim response times array when under 500 entries', () => {
      const responseTimes = Array.from({ length: 100 }, (_, i) => i);
      monitoringService.metrics.responseTimes = responseTimes;

      monitoringService.performMemoryCleanup();

      expect(monitoringService.metrics.responseTimes.length).toBe(100);
    });

    it('should reset metrics counters when requests exceed 100,000', () => {
      monitoringService.metrics.requests = 150000;
      monitoringService.metrics.errors = 1500;

      monitoringService.performMemoryCleanup();

      expect(monitoringService.metrics.requests).toBe(75000); // halved
      expect(monitoringService.metrics.errors).toBe(750); // halved
    });

    it('should not reset metrics counters when under threshold', () => {
      monitoringService.metrics.requests = 50000;
      monitoringService.metrics.errors = 500;

      monitoringService.performMemoryCleanup();

      expect(monitoringService.metrics.requests).toBe(50000);
      expect(monitoringService.metrics.errors).toBe(500);
    });

    it('should update memory usage after cleanup', () => {
      const originalMemoryUsage = monitoringService.metrics.memoryUsage;
      const mockMemoryUsage = jest.spyOn(process, 'memoryUsage');

      monitoringService.performMemoryCleanup();

      expect(mockMemoryUsage).toHaveBeenCalled();
      mockMemoryUsage.mockRestore();
    });
  });

  describe('checkAlerts', () => {
    it('should trigger memory cleanup when usage exceeds 90%', () => {
      // Mock high memory usage
      const mockMemoryUsage = {
        heapUsed: 95 * 1024 * 1024, // 95 MB
        heapTotal: 100 * 1024 * 1024 // 100 MB
      };

      jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);
      const cleanupSpy = jest.spyOn(monitoringService, 'performMemoryCleanup');

      monitoringService.checkAlerts();

      expect(cleanupSpy).toHaveBeenCalled();
      cleanupSpy.mockRestore();
    });

    it('should not trigger memory cleanup when usage is below 90%', () => {
      // Mock normal memory usage
      const mockMemoryUsage = {
        heapUsed: 50 * 1024 * 1024, // 50 MB
        heapTotal: 100 * 1024 * 1024 // 100 MB
      };

      jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);
      const cleanupSpy = jest.spyOn(monitoringService, 'performMemoryCleanup');

      monitoringService.checkAlerts();

      expect(cleanupSpy).not.toHaveBeenCalled();
      cleanupSpy.mockRestore();
    });
  });

  describe('recordRequest', () => {
    it('should limit response times array to 1000 entries', () => {
      // Add 1000 response times
      for (let i = 0; i < 1000; i++) {
        monitoringService.recordRequest('GET', '/test', 100, 200);
      }

      expect(monitoringService.metrics.responseTimes.length).toBe(1000);

      // Add one more - should still be 1000 (oldest removed)
      monitoringService.recordRequest('GET', '/test', 100, 200);

      expect(monitoringService.metrics.responseTimes.length).toBe(1000);
    });
  });
});
