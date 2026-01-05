const jwt = require('jsonwebtoken');
const auth = require('../../src/middleware/auth');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      header: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('Token Validation', () => {
    test('should accept valid Bearer token', () => {
      const token = jwt.sign({ id: 'user123', role: 'user' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user123');
      expect(req.user.role).toBe('user');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should accept valid x-auth-token', () => {
      const token = jwt.sign({ id: 'user123', role: 'user' }, process.env.JWT_SECRET);
      req.header.mockImplementation((header) => {
        if (header === 'Authorization') return null;
        if (header === 'x-auth-token') return token;
      });

      auth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user123');
      expect(next).toHaveBeenCalled();
    });

    test('should reject request without token', () => {
      req.header.mockReturnValue(null);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'No token, authorization denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid token', () => {
      req.header.mockReturnValue('Bearer invalid-token');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject expired token', () => {
      const token = jwt.sign(
        { id: 'user123', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      req.header.mockReturnValue(`Bearer ${token}`);

      // Wait for token to expire
      setTimeout(() => {
        auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
        expect(next).not.toHaveBeenCalled();
      }, 100);
    });

    test('should reject token with wrong secret', () => {
      const token = jwt.sign({ id: 'user123', role: 'user' }, 'wrong-secret');
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token Format', () => {
    test('should handle Bearer token with extra spaces', () => {
      const token = jwt.sign({ id: 'user123', role: 'user' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer  ${token}`);

      auth(req, res, next);

      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    test('should reject malformed Bearer token', () => {
      req.header.mockReturnValue('Bearertoken');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject empty Bearer token', () => {
      req.header.mockReturnValue('Bearer ');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('User Data Extraction', () => {
    test('should extract user id from token', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user.id).toBe('user123');
    });

    test('should extract user role from token', () => {
      const token = jwt.sign({ id: 'user123', role: 'admin' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user.role).toBe('admin');
    });

    test('should handle token with additional payload data', () => {
      const token = jwt.sign(
        { id: 'user123', role: 'user', email: 'test@example.com' },
        process.env.JWT_SECRET
      );
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user.id).toBe('user123');
      expect(req.user.email).toBe('test@example.com');
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing JWT_SECRET gracefully', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const token = jwt.sign({ id: 'user123' }, 'any-secret');
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        msg: 'Server configuration error: JWT secret missing.'
      });

      process.env.JWT_SECRET = originalSecret;
    });

    test('should handle null user data in token', () => {
      const token = jwt.sign({ id: null, role: null }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user.id).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });
});