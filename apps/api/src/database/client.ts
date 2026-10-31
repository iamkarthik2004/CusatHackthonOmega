import pg from "pg";

const { Pool } = pg;
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}
