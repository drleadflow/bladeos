import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { initializeDb } from '@blade/db'
import { startMonitorScheduler, loadEmployeeDefinitions, RoutineScheduler } from '@blade/core'

let initialized = false

/**
 * One-time server initialization. Safe to call multiple times.
 * Initializes database, starts monitor scheduler, seeds employees from YAML.
 */
export function ensureServerInit(): void {
  if (initialized) return
  initialized = true

  initializeDb()

  // Seed employees from YAML definitions (idempotent — skips existing)
  try {
    // Try multiple possible paths for the definitions directory
    const candidates = [
      join(process.cwd(), '..', 'packages', 'core', 'src', 'employees', 'definitions'),
      join(process.cwd(), 'packages', 'core', 'src', 'employees', 'definitions'),
      join(process.cwd(), '..', '..', 'packages', 'core', 'src', 'employees', 'definitions'),
    ]
    const defsDir = candidates.find(p => existsSync(p))
    if (defsDir) {
      loadEmployeeDefinitions(defsDir)
      console.log('[server-init] Employee definitions loaded from YAML')
    }
  } catch (err) {
    console.error('[server-init] Employee seeding failed:', err)
  }

  // Start monitor scheduler (runs 3 built-in monitors on startup + every 6h)
  startMonitorScheduler().catch((err) => {
    console.error('[server-init] Monitor scheduler failed:', err)
  })

  // Start routine scheduler (checks every 60s for due employee routines)
  try {
    const scheduler = new RoutineScheduler()
    scheduler.start()
    console.log('[server-init] Routine scheduler started')
  } catch (err) {
    console.error('[server-init] Routine scheduler failed:', err)
  }
}
