import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Cookie configuration
//
// HttpOnly   — JS cannot read the cookie (XSS protection)
// Secure     — only sent over HTTPS (in production; disabled in dev)
// SameSite   — 'lax' allows cross-site GET, blocks cross-site POST (CSRF protection)
// Path       — cookie is sent to all paths
// ---------------------------------------------------------------------------

function setAuthCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(new AppError(400, 'Validation failed', details));
    }

    const { user, token } = await authService.register(result.data);

    setAuthCookie(res, token);

    res.status(201).json({
      status: 'success',
      data: { user },
      // token also returned for non-browser clients (e.g. curl, Postman, mobile)
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(new AppError(400, 'Validation failed', details));
    }

    const { user, token } = await authService.login(result.data);

    setAuthCookie(res, token);

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

export async function logout(
  _req: Request,
  res: Response
): Promise<void> {
  res.clearCookie('token', { path: '/' });
  res.status(200).json({ status: 'success', message: 'Logged out' });
}

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected)
// ---------------------------------------------------------------------------

export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.userId);

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}
