import Redis from 'ioredis';
import { env } from './env';

// ---------------------------------------------------------------------------
// redis.ts — Redis connection module
//
// Responsibilities:
//   - Create and export a single Redis client instance
//   - Log connection events
//   - Degrade gracefully on connection failure (non-fatal for the app)
//
// NOT responsible for: cache logic, rate limiting, pub/sub, job queues
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  return redisClient;
}

/** Returns true only when Redis is connected and ready for commands */
export function isRedisReady(): boolean {
  return redisClient?.status === 'ready';
}

export async function connectRedis(): Promise<void> {
  redisClient = new Redis(env.REDIS_URL, {
    // Do not crash the process on connection failure — degrade gracefully
    lazyConnect: true,
    maxRetriesPerRequest: 0,      // fail immediately, don't retry commands
    enableReadyCheck: true,
    commandTimeout: 500,          // 500ms max per command — prevents request hangs
    retryStrategy: () => null,    // disable auto-reconnect (server is down, don't spam)
  });

  redisClient.on('connect', () => {
    console.log('[redis] Connected ✓');
  });

  redisClient.on('error', (err) => {
    // Log but do not exit — the app can continue without Redis
    console.error('[redis] Error:', err.message);
  });

  redisClient.on('close', () => {
    console.warn('[redis] Connection closed');
  });

  try {
    await redisClient.connect();
  } catch (err) {
    // Non-fatal — Redis features (rate limiting, caching) will degrade
    console.warn('[redis] Could not connect at startup (non-fatal):', (err as Error).message);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export default getRedis;
