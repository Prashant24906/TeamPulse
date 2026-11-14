import 'dotenv/config';
import postgres from 'postgres';

// postgres.js manages its own connection pool internally.
// It uses tagged template literals for queries: sql`SELECT 1`
const sql = postgres(process.env.DATABASE_URL!, {
  ssl: 'require',
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}, // suppress NOTICE messages
});

/** Verify the DB is reachable at startup. */
export async function connectDB(): Promise<void> {
  await sql`SELECT 1`;
  console.log('[db] Connected to Supabase Postgres ✓');
}

/**
 * Drain and close the PostgreSQL connection pool gracefully.
 *
 * @param timeoutSecs Maximum seconds to wait for active queries to complete. Default: 5
 */
export async function disconnectDB(timeoutSecs = 5): Promise<void> {
  try {
    await sql.end({ timeout: timeoutSecs });
    console.log('[db] PostgreSQL pool closed.');
  } catch (err) {
    console.error('[db] Error closing PostgreSQL pool:', (err as Error).message);
  }
}

/**
 * Run multiple statements inside a transaction.
 *
 * Usage:
 *   await withTransaction(async (tx) => {
 *     await tx`INSERT ...`;
 *     await tx`UPDATE ...`;
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: typeof sql) => Promise<T>
): Promise<T> {
  return sql.begin(fn as any) as any;
}

export { sql };
export default sql;