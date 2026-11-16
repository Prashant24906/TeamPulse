import { env } from './env';

/**
 * Creates a CORS origin validator function compatible with both Express `cors`
 * and Socket.IO `cors.origin`.
 *
 * Capabilities:
 * - Trims whitespace and strips trailing slashes
 * - Supports comma-separated origin lists (e.g. "https://app1.com,https://app2.com")
 * - Matches Vercel preview domains if target starts with or contains ".vercel.app"
 * - Allows non-browser requests (origin === undefined) e.g. curl, mobile, worker
 * - Allows localhost in development environments
 */
export function createCorsOriginValidator(rawCorsOrigin?: string) {
  const raw = rawCorsOrigin ?? env.CORS_ORIGIN ?? 'http://localhost:3000';
  const allowedList = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void => {
    // Non-browser clients (server-to-server, curl, Postman, mobile) don't send Origin
    if (!origin) {
      return callback(null, true);
    }

    const normalized = origin.trim().replace(/\/+$/, '');

    // 1. Direct wildcard
    if (allowedList.includes('*')) {
      return callback(null, true);
    }

    // 2. Exact match in allowedList
    if (allowedList.includes(normalized)) {
      return callback(null, true);
    }

    // 3. Vercel preview deployments (e.g. teampulse-*.vercel.app if vercel.app is allowed)
    const hasVercelAllowed = allowedList.some((allowed) => allowed.includes('.vercel.app'));
    if (hasVercelAllowed && normalized.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // 4. Localhost / local IP support in development
    if (env.NODE_ENV !== 'production') {
      if (
        normalized.includes('localhost') ||
        normalized.includes('127.0.0.1') ||
        normalized.startsWith('http://192.168.') ||
        normalized.startsWith('http://10.')
      ) {
        return callback(null, true);
      }
    }

    // Reject disallowed origins gracefully
    console.warn(`[cors] Blocked request from unauthorized origin: ${origin}`);
    return callback(null, false);
  };
}
