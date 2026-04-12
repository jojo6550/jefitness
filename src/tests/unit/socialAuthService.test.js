// src/tests/unit/socialAuthService.test.js
describe('User model - social auth fields', () => {
  let User;

  beforeAll(() => {
    jest.isolateModules(() => {
      User = require('../../models/User');
    });
  });

  it('validates without password when googleId is present', () => {
    const user = new User({
      email: 'g@test.com',
      firstName: 'Test',
      lastName: 'User',
      googleId: 'gid_123',
      isEmailVerified: true,
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeUndefined();
  });

  it('validates without password when facebookId is present', () => {
    const user = new User({
      email: 'fb@test.com',
      firstName: 'Test',
      lastName: 'User',
      facebookId: 'fbid_123',
      isEmailVerified: true,
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeUndefined();
  });

  it('requires password when no social ID present', () => {
    const user = new User({
      email: 'pw@test.com',
      firstName: 'Test',
      lastName: 'User',
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeDefined();
  });
});
