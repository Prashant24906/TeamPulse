import { getRedis, isRedisReady } from '../config/redis';

// ---------------------------------------------------------------------------
// cache.ts — Generic cache-aside utility
//
// Pattern:
//   READ:  Redis → HIT → return | MISS → DB → set in Redis → return
//   WRITE: DB mutation → invalidate Redis key
//
// Key namespacing convention:
//   team:<teamId>
//   project:<projectId>
//
// Redis failures and unavailability degrade gracefully — we fall through
// to the DB and never return stale or corrupt data.
// ---------------------------------------------------------------------------

/** Default TTL (seconds) for cached entries */
const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get a cached value. Returns null on cache miss, Redis unavailability, or parse error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) return null;
  try {
    const redis = getRedis()!;
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Store a value in Redis with a TTL.
 * Silently ignores Redis unavailability and failures.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = DEFAULT_TTL
): Promise<void> {
  if (!isRedisReady()) return;
  try {
    const redis = getRedis()!;
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Non-fatal
  }
}

/**
 * Delete one or more cache keys (invalidation).
 * Silently ignores Redis unavailability and failures.
 */
export async function cacheInvalidate(...keys: string[]): Promise<void> {
  if (!isRedisReady() || keys.length === 0) return;
  try {
    const redis = getRedis()!;
    await redis.del(...keys);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Namespaced key helpers — single source of truth for key names
// ---------------------------------------------------------------------------

export const CacheKeys = {
  team:    (teamId: string)    => `team:${teamId}`,
  project: (projectId: string) => `project:${projectId}`,
} as const;
