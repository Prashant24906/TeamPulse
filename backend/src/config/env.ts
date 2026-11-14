import dotenv from 'dotenv';
import path from 'path';

// Load backend/.env (sits at backend/ root, two levels above this file)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Validates and trims the JWT secret.
 * Enforces:
 * - Must exist (not undefined or null)
 * - Whitespace-only values rejected
 * - Leading/trailing whitespace trimmed
 * - Minimum length of 32 characters
 * Never exposes the secret value in error messages.
 */
export function validateJwtSecret(raw?: string): string {
  if (raw === undefined || raw === null) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('JWT_SECRET must not be empty or whitespace-only');
  }
  if (trimmed.length < 32) {
    throw new Error(`JWT_SECRET must be at least 32 characters long (received ${trimmed.length})`);
  }
  return trimmed;
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '4000'), 10),

  // Database — pulled from Neon via backend/.env
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: optional('DATABASE_URL_UNPOOLED', ''),

  // Auth (Phase 2) — minimum 32 chars enforced, trimmed, no weak/fallback secret
  JWT_SECRET: validateJwtSecret(process.env.JWT_SECRET),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),

  // CORS
  CORS_ORIGIN: optional('CORS_ORIGIN', 'http://localhost:3000'),

  // Redis (Phase 7)
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),
} as const;
