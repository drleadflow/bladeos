import { initializeDb } from '@blade/db'
import { startMonitorScheduler } from '@blade/core'

let initialized = false

/**
 * One-time server initialization. Safe to call multiple times.
 * Initializes database, starts monitor scheduler, and seeds data.
 */
export function ensureServerInit(): void {
  if (initialized) return
  initialized = true

  initializeDb()

  // Start monitor scheduler (runs 3 built-in monitors on startup + every 6h)
  startMonitorScheduler().catch((err) => {
    console.error('[server-init] Monitor scheduler failed:', err)
  })
}
