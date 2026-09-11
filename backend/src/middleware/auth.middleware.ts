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
// authenticate — verifies the Bearer token and attaches req.user
// ---------------------------------------------------------------------------

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required'));
  }

  const token = authHeader.slice(7); // strip "Bearer "

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
