import { Request, Response, NextFunction } from 'express';
import { getRedis, isRedisReady } from '../config/redis';

// ---------------------------------------------------------------------------
// rateLimit.middleware.ts — Redis-backed sliding-window rate limiter
//
// Uses Redis INCR + EXPIRE to count requests per (IP, route prefix) per window.
// Degrades gracefully when Redis is unavailable — requests pass through.
//
// Usage:
//   router.post('/login', rateLimit({ window: 60, max: 10 }), controller.login)
//   router.use(rateLimit({ window: 60, max: 100 }))  // default for all routes
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  /** Time window in seconds. Default: 60 */
  window?: number;
  /** Max requests per IP per window. Default: 60 */
  max?: number;
  /** Key prefix for Redis (used to separate limits per route group). Default: 'rl' */
  prefix?: string;
}

export function rateLimit({
  window: windowSecs = 60,
  max = 60,
  prefix = 'rl',
}: RateLimitOptions = {}) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const ip = (
      req.headers['x-forwarded-for']?.toString().split(',')[0] ??
      req.socket.remoteAddress ??
      'unknown'
    ).trim();

    const key = `${prefix}:${ip}`;

    try {
      // If Redis is not ready, degrade gracefully — let request through
      if (!isRedisReady()) {
        console.warn('[rateLimit] Redis not ready, skipping rate limit check');
        return next();
      }

      const redis = getRedis()!;

      // Atomic increment + set TTL if key is new
      const count = await redis.incr(key);
      if (count === 1) {
        // First request in this window — set the expiry
        await redis.expire(key, windowSecs);
      }

      const ttl = await redis.ttl(key);

      res.setHeader('X-RateLimit-Limit',     max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset',     Math.ceil(Date.now() / 1000) + ttl);

      if (count > max) {
        res.status(429).json({
          status:  'error',
          message: `Too many requests. Please try again in ${ttl} seconds.`,
        });
        return;
      }

      next();
    } catch {
      // Redis unavailable — degrade gracefully, let the request through
      console.warn('[rateLimit] Redis unavailable, skipping rate limit check');
      next();
    }
  };
}

// ---------------------------------------------------------------------------
// Pre-configured limiters for specific route groups
// ---------------------------------------------------------------------------

/**
 * Strict limit for auth endpoints (login, register).
 * 10 requests per minute per IP.
 */
export const authRateLimit = rateLimit({ window: 60, max: 10, prefix: 'rl:auth' });

/**
 * Standard limit for general API endpoints.
 * 60 requests per minute per IP.
 */
export const apiRateLimit = rateLimit({ window: 60, max: 60, prefix: 'rl:api' });
