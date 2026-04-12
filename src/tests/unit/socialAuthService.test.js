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

  it('validates without password when twitterId is present', () => {
    const user = new User({
      email: 'tw@test.com',
      firstName: 'Test',
      lastName: 'User',
      twitterId: 'twid_123',
      isEmailVerified: true,
    });
    const err = user.validateSync();
    expect(err?.errors?.password).toBeUndefined();
  });

  it('validates without password when appleId is present', () => {
    const user = new User({
      email: 'apple@test.com',
      firstName: 'Test',
      lastName: 'User',
      appleId: 'aid_123',
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

describe('verifyOrLinkSocialUser', () => {
  let User;
  let verifyOrLinkSocialUser;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/User', () => ({
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    }));
    User = require('../../models/User');
    ({ verifyOrLinkSocialUser } = require('../../services/socialAuthService'));
    jest.clearAllMocks();
  });

  it('returns existing user found by provider ID', async () => {
    const mockUser = { _id: 'uid1', googleId: 'gid1', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValueOnce(mockUser);

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid1',
      email: 'test@test.com', firstName: 'John', lastName: 'Doe',
    });

    expect(result).toEqual({ user: mockUser, isNew: false });
    expect(User.findOne).toHaveBeenCalledWith({ googleId: 'gid1' });
  });

  it('links account when email matches existing user', async () => {
    const mockUser = {
      _id: 'uid1', email: 'test@test.com',
      role: 'user', tokenVersion: 0,
      save: jest.fn().mockResolvedValue(true),
    };
    User.findOne = jest.fn()
      .mockResolvedValueOnce(null)       // not found by googleId
      .mockResolvedValueOnce(mockUser);  // found by email

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid1',
      email: 'test@test.com', firstName: 'John', lastName: 'Doe',
    });

    expect(mockUser.googleId).toBe('gid1');
    expect(mockUser.save).toHaveBeenCalled();
    expect(result).toEqual({ user: mockUser, isNew: false });
  });

  it('creates new user when no match found', async () => {
    const newUser = { _id: 'uid2', email: 'new@test.com', googleId: 'gid2', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValue(null);
    User.create = jest.fn().mockResolvedValueOnce(newUser);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(newUser),
    });

    const result = await verifyOrLinkSocialUser({
      provider: 'google', providerId: 'gid2',
      email: 'new@test.com', firstName: 'Jane', lastName: 'Doe',
    });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@test.com',
      googleId: 'gid2',
      isEmailVerified: true,
    }));
    expect(result).toEqual({ user: newUser, isNew: true });
  });

  it('skips email lookup when email is null', async () => {
    const newUser = { _id: 'uid3', twitterId: 'tid1', role: 'user', tokenVersion: 0 };
    User.findOne = jest.fn().mockResolvedValueOnce(null); // only searched by twitterId
    User.create = jest.fn().mockResolvedValueOnce(newUser);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(newUser),
    });

    await verifyOrLinkSocialUser({
      provider: 'twitter', providerId: 'tid1',
      email: null, firstName: 'TwitterUser', lastName: '',
    });

    // findOne called exactly once (by twitterId), NOT a second time by email
    expect(User.findOne).toHaveBeenCalledTimes(1);
  });
});
