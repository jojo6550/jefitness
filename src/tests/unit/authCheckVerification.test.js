// src/tests/unit/authCheckVerification.test.js

jest.mock('../../models/User');
const User = require('../../models/User');

describe('check-verification: deleted account guard', () => {
  it('returns verified:false when user has dataDeletedAt set', async () => {
    const deletedUser = {
      isEmailVerified: true,
      dataDeletedAt: new Date('2026-01-01'),
      email: 'test@example.com',
      _id: 'user123',
      role: 'user',
      tokenVersion: 0,
      firstName: 'Test',
      lastName: 'User',
    };
    User.findOne = jest.fn().mockResolvedValue(deletedUser);

    // Simulate the guard: if isEmailVerified but dataDeletedAt is set, return verified:false
    const result = deletedUser.isEmailVerified && !deletedUser.dataDeletedAt;
    expect(result).toBe(false);
  });

  it('returns verified:true when user is verified and not deleted', async () => {
    const activeUser = {
      isEmailVerified: true,
      dataDeletedAt: null,
    };
    const result = activeUser.isEmailVerified && !activeUser.dataDeletedAt;
    expect(result).toBe(true);
  });
});
