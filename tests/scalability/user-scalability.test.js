const User = require('../../src/models/User');

// Mock bcryptjs to avoid dependency issues in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
}));

const bcrypt = require('bcryptjs');

describe('User Scalability Tests', () => {
  describe('Creating 100 User Accounts', () => {
    it('should create 100 users without errors and within reasonable time', async () => {
      const startTime = Date.now();
      const users = [];

      // Generate 100 user data
      for (let i = 0; i < 10000; i++) {
        users.push({
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
          password: 'Password123!', // Valid password for validation
          role: 'user',
        });
      }

      // Create users in parallel
      const createPromises = users.map(userData => new User(userData).save());
      const results = await Promise.all(createPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assertions
      expect(results).toHaveLength(100);
      results.forEach(user => {
        expect(user).toBeDefined();
        expect(user.email).toMatch(/user\d+@example\.com/);
      });

      // Performance check: Should take less than 10 seconds (adjust based on environment)
      expect(duration).toBeLessThan(10000);

      console.log(`Created 100 users in ${duration}ms`);
    });

    it('should handle concurrent user creation without conflicts', async () => {
      const userPromises = [];

      for (let i = 100; i < 200; i++) {
        userPromises.push(
          new User({
            firstName: `ConcurrentFirst${i}`,
            lastName: `ConcurrentLast${i}`,
            email: `concurrentuser${i}@example.com`,
            password: 'Password123!', // Valid password for validation
            role: 'user',
          }).save()
        );
      }

      const results = await Promise.all(userPromises);

      expect(results).toHaveLength(100);
      results.forEach(user => {
        expect(user).toBeDefined();
        expect(user.email).toMatch(/concurrentuser\d+@example\.com/);
      });
    });
  });
});
