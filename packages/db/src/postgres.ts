import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

let _pool: pg.Pool | null = null
let _db: ReturnType<typeof drizzle> | null = null

/**
 * Get or create the Postgres connection pool and Drizzle client.
 * Uses SUPABASE_DB_URL or DATABASE_URL env var.
 */
export function getPgDb(): ReturnType<typeof drizzle> {
  if (_db) return _db

  const connectionString =
    process.env['SUPABASE_DB_URL'] ??
    process.env['DATABASE_URL'] ??
    ''

  if (!connectionString || connectionString.startsWith('file:')) {
    throw new Error(
      'No PostgreSQL connection string found. Set SUPABASE_DB_URL or DATABASE_URL.'
    )
  }

  _pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false },
  })

  _db = drizzle(_pool)
  return _db
}

/**
 * Close the connection pool (for graceful shutdown).
 */
export async function closePgPool(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
  }
}
