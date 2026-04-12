export type DatabaseBackend = 'sqlite' | 'postgres'

/**
 * Get the configured database backend.
 * Defaults to 'sqlite' for backwards compatibility.
 */
export function getBackend(): DatabaseBackend {
  const backend = process.env['DATABASE_BACKEND'] ?? 'sqlite'
  if (backend !== 'sqlite' && backend !== 'postgres') {
    throw new Error(
      `Invalid DATABASE_BACKEND: ${backend}. Must be 'sqlite' or 'postgres'.`
    )
  }
  return backend
}

/**
 * Get the Drizzle PostgreSQL client.
 * Only call this when DATABASE_BACKEND=postgres.
 * Returns the same type as getPgDb() to avoid unsafe casts.
 */
export async function pgDb(): Promise<ReturnType<typeof import('./postgres.js').getPgDb>> {
  const { getPgDb } = await import('./postgres.js')
  return getPgDb()
}

/**
 * Check if we're running in PostgreSQL mode.
 */
export function isPostgres(): boolean {
  return getBackend() === 'postgres'
}
