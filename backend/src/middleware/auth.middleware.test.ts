import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate } from './auth.middleware';
import { login, register } from '../controllers/auth.controller';
import * as authService from '../services/auth.service';
import { env } from '../config/env';

describe('Auth Middleware & Controller (Bearer Token & Persistence)', () => {
  const testUserId = '11111111-2222-3333-4444-555555555555';
  const testSecret = env.JWT_SECRET || 'test_secret_that_is_at_least_32_characters_long!';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate middleware', () => {
    it('authenticates successfully via Authorization: Bearer <token>', () => {
      const validToken = jwt.sign({ userId: testUserId }, testSecret, { expiresIn: '1h' });
      const req: any = {
        cookies: {},
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({ userId: testUserId });
    });

    it('handles Authorization header with surrounding whitespace', () => {
      const validToken = jwt.sign({ userId: testUserId }, testSecret, { expiresIn: '1h' });
      const req: any = {
        cookies: {},
        headers: {
          authorization: `Bearer    ${validToken}   `,
        },
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({ userId: testUserId });
    });

    it('authenticates via cookie if present', () => {
      const validToken = jwt.sign({ userId: testUserId }, testSecret, { expiresIn: '1h' });
      const req: any = {
        cookies: { token: validToken },
        headers: {},
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({ userId: testUserId });
    });

    it('rejects with 401 when both cookie and Authorization header are missing', () => {
      const req: any = {
        cookies: {},
        headers: {},
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        message: 'Authentication required',
      }));
      expect(req.user).toBeUndefined();
    });

    it('rejects with 401 when token is invalid', () => {
      const req: any = {
        cookies: {},
        headers: {
          authorization: 'Bearer invalid-token-string',
        },
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        message: 'Invalid token',
      }));
    });

    it('rejects with 401 when token is expired', () => {
      const expiredToken = jwt.sign({ userId: testUserId }, testSecret, { expiresIn: '-1s' });
      const req: any = {
        cookies: {},
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      };
      const res: any = {};
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        message: 'Token has expired',
      }));
    });
  });

  describe('auth.controller login response', () => {
    it('returns token in data.token and top-level token on successful login', async () => {
      const fakeUser: any = { id: testUserId, email: 'test@example.com', name: 'Tester', username: 'tester' };
      const fakeToken = 'signed-jwt-token-12345';

      vi.spyOn(authService, 'login').mockResolvedValue({
        user: fakeUser,
        token: fakeToken,
      });

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'Password123!',
        },
      };
      const res: any = {
        cookie: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith('token', fakeToken, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        data: {
          user: fakeUser,
          token: fakeToken,
        },
        token: fakeToken,
      }));
    });
  });

  describe('auth.controller register response', () => {
    it('returns token in data.token and top-level token on successful register', async () => {
      const fakeUser: any = { id: testUserId, email: 'new@example.com', name: 'New User', username: 'newuser' };
      const fakeToken = 'signed-jwt-register-token-67890';

      vi.spyOn(authService, 'register').mockResolvedValue({
        user: fakeUser,
        token: fakeToken,
      });

      const req: any = {
        body: {
          name: 'New User',
          username: 'newuser',
          email: 'new@example.com',
          password: 'Password123!',
        },
      };
      const res: any = {
        cookie: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.cookie).toHaveBeenCalledWith('token', fakeToken, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        data: {
          user: fakeUser,
          token: fakeToken,
        },
        token: fakeToken,
      }));
    });
  });
});
