const userCache = require('../../services/userCache');
const User = require('../../models/User');

// Mock User model
jest.mock('../../models/User');

describe('User Cache Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userCache.clear();
  });

  describe('findById', () => {
    it('should fetch user from database on first call', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const user = await userCache.findById(userId);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(user).toEqual(mockUser);
    });

    it('should return cached user on subsequent calls (request cache)', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      };

      const req = { userCache: new Map() };

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // First call
      const user1 = await userCache.findById(userId, req);
      expect(User.findById).toHaveBeenCalledTimes(1);

      // Second call should use request cache
      const user2 = await userCache.findById(userId, req);
      expect(User.findById).toHaveBeenCalledTimes(1); // Still 1!
      expect(user1).toEqual(user2);
    });

    it('should use process cache when request cache unavailable', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob@example.com',
      };

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // First call — populates process cache
      const user1 = await userCache.findById(userId);
      expect(User.findById).toHaveBeenCalledTimes(1);

      // Second call with different request object — should use process cache
      const user2 = await userCache.findById(userId);
      expect(User.findById).toHaveBeenCalledTimes(1); // Still 1!
      expect(user1).toEqual(user2);
    });

    it('should support selective field fetching', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'Alice',
        lastName: 'Williams',
      };

      User.findById.mockReturnValueOnce({
        select: jest.fn().mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue(mockUser),
        }),
      });

      const user = await userCache.findById(userId, null, {
        fields: 'firstName lastName',
      });

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(user.email).toBeUndefined(); // Email not selected
      expect(user.firstName).toBe('Alice');
    });

    it('should return null for non-existent user', async () => {
      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(null),
      });

      const user = await userCache.findById('nonexistent');
      expect(user).toBeNull();
    });

    it('should skip cache when skipCache option is true', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'Charlie',
        lastName: 'Brown',
      };

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // First call
      await userCache.findById(userId);
      expect(User.findById).toHaveBeenCalledTimes(1);

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // Second call with skipCache
      await userCache.findById(userId, null, { skipCache: true });
      expect(User.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('findByIds', () => {
    it('should fetch multiple users in one query', async () => {
      const ids = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ];
      const mockUsers = [
        { _id: ids[0], firstName: 'User1', lastName: 'One' },
        { _id: ids[1], firstName: 'User2', lastName: 'Two' },
      ];

      User.find.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUsers),
      });

      const userMap = await userCache.findByIds(ids);

      expect(User.find).toHaveBeenCalledWith({ _id: { $in: ids } });
      expect(userMap.size).toBe(2);
      expect(userMap.get(ids[0]).firstName).toBe('User1');
      expect(userMap.get(ids[1]).firstName).toBe('User2');
    });

    it('should cache batch results', async () => {
      const ids = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ];
      const mockUsers = [
        { _id: ids[0], firstName: 'User1', lastName: 'One' },
        { _id: ids[1], firstName: 'User2', lastName: 'Two' },
      ];

      User.find.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUsers),
      });

      // First call
      const map1 = await userCache.findByIds(ids);
      expect(User.find).toHaveBeenCalledTimes(1);

      // Second call — should use cache
      const map2 = await userCache.findByIds(ids);
      expect(User.find).toHaveBeenCalledTimes(1); // Still 1!
      expect(map1).toEqual(map2);
    });

    it('should return empty map for empty input', async () => {
      const userMap = await userCache.findByIds([]);
      expect(userMap.size).toBe(0);
    });

    it('should handle partial cache hits', async () => {
      const ids = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      ];

      const user1 = { _id: ids[0], firstName: 'User1', lastName: 'One' };
      const user2 = { _id: ids[1], firstName: 'User2', lastName: 'Two' };

      // Pre-cache user 1
      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(user1),
      });
      await userCache.findById(ids[0]);

      // Now batch fetch all three — should only query for 2 and 3
      User.find.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue([user2, { _id: ids[2], firstName: 'User3', lastName: 'Three' }]),
      });

      const userMap = await userCache.findByIds(ids);

      expect(User.find).toHaveBeenCalledWith({
        _id: { $in: [ids[1], ids[2]] }, // Only missing IDs
      });
      expect(userMap.size).toBe(3);
    });
  });

  describe('invalidate', () => {
    it('should remove user from process cache', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const mockUser = {
        _id: userId,
        firstName: 'Dave',
        lastName: 'Davis',
      };

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // Cache user
      await userCache.findById(userId);
      expect(User.findById).toHaveBeenCalledTimes(1);

      // Invalidate
      userCache.invalidate(userId);

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      // Next call should query DB again
      await userCache.findById(userId);
      expect(User.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('clear', () => {
    it('should clear entire process cache', async () => {
      const user1Id = '507f1f77bcf86cd799439011';
      const user2Id = '507f1f77bcf86cd799439012';

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: user1Id,
          firstName: 'User1',
        }),
      });
      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: user2Id,
          firstName: 'User2',
        }),
      });

      // Cache both users
      await userCache.findById(user1Id);
      await userCache.findById(user2Id);
      expect(User.findById).toHaveBeenCalledTimes(2);

      // Clear all
      userCache.clear();

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: user1Id,
          firstName: 'User1',
        }),
      });

      // Next call should query DB
      await userCache.findById(user1Id);
      expect(User.findById).toHaveBeenCalledTimes(3);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const userId = '507f1f77bcf86cd799439011';

      User.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: userId,
          firstName: 'Eve',
        }),
      });

      await userCache.findById(userId);

      const stats = userCache.getStats();

      expect(stats).toHaveProperty('processCacheSize');
      expect(stats).toHaveProperty('defaultTTL');
      expect(stats.processCacheSize).toBeGreaterThan(0);
    });
  });
});
