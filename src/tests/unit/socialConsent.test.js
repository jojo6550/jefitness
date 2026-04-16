const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!';
process.env.NODE_ENV = 'test';

describe('authController.socialConsent', () => {
  let socialConsent;
  let User;
  let req, res, next;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/User', () => ({
      findById: jest.fn(),
    }));
    User = require('../../models/User');
    const ctrl = require('../../controllers/authController');
    socialConsent = ctrl.socialConsent;

    req = {
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-test' },
      get: h => req.headers[h.toLowerCase()],
    };
    res = { cookie: jest.fn(), json: jest.fn() };
    next = jest.fn();
  });

  it('grants consent and issues httpOnly cookie for valid token', async () => {
    const consentToken = jwt.sign(
      { userId: 'user123', consentPending: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    req.body.consentToken = consentToken;

    const mockUser = {
      _id: 'user123',
      role: 'user',
      tokenVersion: 0,
      dataProcessingConsent: {},
      healthDataConsent: {},
      save: jest.fn().mockResolvedValue(true),
    };
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    await socialConsent(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockUser.save).toHaveBeenCalled();
    expect(mockUser.dataProcessingConsent.given).toBe(true);
    expect(mockUser.healthDataConsent.given).toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      'token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('calls next with AuthenticationError for expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'uid', consentPending: true },
      process.env.JWT_SECRET,
      { expiresIn: 0 }
    );
    req.body.consentToken = expiredToken;

    await socialConsent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next with AuthenticationError when consentPending flag is missing', async () => {
    const badToken = jwt.sign({ userId: 'uid' }, process.env.JWT_SECRET, {
      expiresIn: '10m',
    });
    req.body.consentToken = badToken;

    await socialConsent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
});
