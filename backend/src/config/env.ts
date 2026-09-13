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

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '4000'), 10),

  // Database — pulled from Neon via backend/.env
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: optional('DATABASE_URL_UNPOOLED', ''),

  // Auth (Phase 2)
  JWT_SECRET: optional('JWT_SECRET', ''),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),

  // CORS
  CORS_ORIGIN: optional('CORS_ORIGIN', 'http://localhost:3000'),

  // Redis (Phase 7)
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),
} as const;
