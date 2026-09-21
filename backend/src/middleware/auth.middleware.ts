import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

// ---------------------------------------------------------------------------
// Extend Express Request so controllers can read req.user safely
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}

// ---------------------------------------------------------------------------
// JWT payload shape
// ---------------------------------------------------------------------------

interface JwtPayload {
  userId: string;
}

// ---------------------------------------------------------------------------
// resolveToken — extract JWT from cookie first, Bearer header as fallback
//
// Priority:
//   1. HttpOnly cookie 'token'           (browser clients)
//   2. Authorization: Bearer <token>     (Postman, curl, mobile)
//
// This allows the browser frontend to use HttpOnly cookies while keeping
// backwards compatibility with API clients that send Bearer tokens.
// ---------------------------------------------------------------------------

function resolveToken(req: Request): string | null {
  // 1. Cookie (set by login/register — HttpOnly, invisible to JS)
  const cookieToken = req.cookies?.token as string | undefined;
  if (cookieToken) return cookieToken;

  // 2. Authorization header fallback
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

// ---------------------------------------------------------------------------
// authenticate — verifies the token and attaches req.user
// ---------------------------------------------------------------------------

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = resolveToken(req);

  if (!token) {
    return next(new AppError(401, 'Authentication required'));
  }

  if (!env.JWT_SECRET) {
    return next(new AppError(500, 'Server misconfiguration: JWT_SECRET missing'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { userId: payload.userId };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Token has expired'));
    }
    return next(new AppError(401, 'Invalid token'));
  }
}
