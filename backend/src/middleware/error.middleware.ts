import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// AppError — a typed, HTTP-aware error class.
//
// Throw this anywhere in the request lifecycle to produce a predictable
// JSON error response. The error middleware below catches it.
//
// Example:
//   throw new AppError(404, 'User not found');
//   throw new AppError(400, 'Invalid input', { field: 'email' });
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// 404 handler — mount after all routes.
// ---------------------------------------------------------------------------

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// ---------------------------------------------------------------------------
// Global error handler — mount last, after notFoundHandler.
//
// Express identifies a function as an error handler by its 4-argument
// signature (err, req, res, next). Do not remove `next` even if unused.
// ---------------------------------------------------------------------------

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Known operational error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // Unknown / programmer error — log it, send generic 500
  console.error('[error]', err);

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    // Expose stack only in development so we never leak internals in production
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
