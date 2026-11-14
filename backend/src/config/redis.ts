import Redis from 'ioredis';
import { env } from './env';

// ---------------------------------------------------------------------------
// redis.ts — Redis connection module
//
// Responsibilities:
//   - Create and export a single Redis client instance
//   - Log connection events
//   - Bounded exponential backoff retry strategy for automatic recovery
//   - Shared BullMQ connection configuration helper supporting auth & TLS
//   - Degrade gracefully on connection failure (non-fatal for the app)
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  return redisClient;
}

/** Returns true only when Redis is connected and ready for commands */
export function isRedisReady(): boolean {
  return redisClient?.status === 'ready';
}

/**
 * Bounded exponential backoff retry strategy for Redis reconnection.
 * Delays: 100ms, 200ms, 400ms, 800ms, 1600ms, capped at 3000ms.
 * Prevents aggressive retry loops while ensuring automatic recovery
 * without requiring a manual backend restart.
 */
export function calculateRetryDelay(times: number): number {
  return Math.min(100 * Math.pow(2, times - 1), 3000);
}

/**
 * Shared connection options for BullMQ queues and workers.
 * Extracts host, port, username, password, and TLS from REDIS_URL.
 * Mandates maxRetriesPerRequest: null as required by BullMQ.
 */
export interface BullMQConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: null;
}

export function getBullMQConnection(redisUrl: string = env.REDIS_URL): BullMQConnectionOptions {
  const normalized = redisUrl.includes('://') ? redisUrl : `redis://${redisUrl}`;
  const parsed = new URL(normalized);
  const isTls = normalized.startsWith('rediss://');

  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || (isTls ? '6380' : '6379'), 10),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: isTls ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export async function connectRedis(): Promise<void> {
  redisClient = new Redis(env.REDIS_URL, {
    // Do not crash the process on connection failure — degrade gracefully
    lazyConnect: true,
    maxRetriesPerRequest: 0,      // fail immediately, don't retry commands
    enableReadyCheck: true,
    commandTimeout: 500,          // 500ms max per command — prevents request hangs
    retryStrategy: calculateRetryDelay, // bounded exponential backoff
    // Required for Redis Cloud / TLS (rediss:// URL uses TLS)
    tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
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

  redisClient.on('reconnecting', (time: number) => {
    console.log(`[redis] Reconnecting in ${time}ms...`);
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
