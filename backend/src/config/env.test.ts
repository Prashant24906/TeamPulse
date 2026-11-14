import { describe, it, expect } from 'vitest';
import { validateJwtSecret } from './env';
import { calculateRetryDelay, getBullMQConnection } from './redis';

describe('JWT Secret Validation', () => {
  it('throws when secret is undefined', () => {
    expect(() => validateJwtSecret(undefined)).toThrow(
      'Missing required environment variable: JWT_SECRET'
    );
  });

  it('throws when secret is empty string', () => {
    expect(() => validateJwtSecret('')).toThrow(
      'JWT_SECRET must not be empty or whitespace-only'
    );
  });

  it('throws when secret is whitespace-only', () => {
    expect(() => validateJwtSecret('   \t\n  ')).toThrow(
      'JWT_SECRET must not be empty or whitespace-only'
    );
  });

  it('throws when secret is shorter than 32 characters', () => {
    const shortSecret = 'a'.repeat(31);
    expect(() => validateJwtSecret(shortSecret)).toThrow(
      'JWT_SECRET must be at least 32 characters long (received 31)'
    );
  });

  it('never prints the secret value in the error message for short secrets', () => {
    const sensitiveSecret = 'super_secret_short_value';
    try {
      validateJwtSecret(sensitiveSecret);
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain(sensitiveSecret);
    }
  });

  it('accepts and trims a valid secret of 32+ characters', () => {
    const valid32 = '01234567890123456789012345678901';
    const padded = `   ${valid32}   \n`;
    const result = validateJwtSecret(padded);
    expect(result).toBe(valid32);
    expect(result.length).toBe(32);
  });

  it('accepts longer secrets', () => {
    const longSecret = 'x'.repeat(64);
    const result = validateJwtSecret(longSecret);
    expect(result).toBe(longSecret);
  });
});

describe('Redis Configuration', () => {
  describe('calculateRetryDelay', () => {
    it('implements bounded exponential backoff', () => {
      expect(calculateRetryDelay(1)).toBe(100);
      expect(calculateRetryDelay(2)).toBe(200);
      expect(calculateRetryDelay(3)).toBe(400);
      expect(calculateRetryDelay(4)).toBe(800);
      expect(calculateRetryDelay(5)).toBe(1600);
      // Capped at 3000ms
      expect(calculateRetryDelay(6)).toBe(3000);
      expect(calculateRetryDelay(10)).toBe(3000);
      expect(calculateRetryDelay(100)).toBe(3000);
    });
  });

  describe('getBullMQConnection', () => {
    it('parses standard redis URL with host and port', () => {
      const conn = getBullMQConnection('redis://localhost:6379');
      expect(conn.host).toBe('localhost');
      expect(conn.port).toBe(6379);
      expect(conn.username).toBeUndefined();
      expect(conn.password).toBeUndefined();
      expect(conn.tls).toBeUndefined();
      expect(conn.maxRetriesPerRequest).toBeNull();
    });

    it('extracts credentials and enables TLS for rediss:// URLs', () => {
      const conn = getBullMQConnection('rediss://myuser:mypassword@redis.cloud.com:12345');
      expect(conn.host).toBe('redis.cloud.com');
      expect(conn.port).toBe(12345);
      expect(conn.username).toBe('myuser');
      expect(conn.password).toBe('mypassword');
      expect(conn.tls).toEqual({});
      expect(conn.maxRetriesPerRequest).toBeNull();
    });

    it('handles encoded passwords in redis URLs', () => {
      const conn = getBullMQConnection('redis://:p%40ssw%3Ard@10.0.0.1:6379');
      expect(conn.host).toBe('10.0.0.1');
      expect(conn.port).toBe(6379);
      expect(conn.password).toBe('p@ssw:rd');
      expect(conn.maxRetriesPerRequest).toBeNull();
    });
  });
});

