import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeDb } from '@blade/db'
import { startMonitorScheduler, loadEmployeeDefinitions, RoutineScheduler, createExecutionAPI, startDecayScheduler, startConsolidationScheduler } from '@blade/core'
import { createConversationEngine } from '@blade/conversation'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
    // Resolve from this file's location (apps/web/src/lib/) to avoid process.cwd() issues on Railway
    const candidates = [
      join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'employees', 'definitions'),
      join(process.cwd(), 'packages', 'core', 'src', 'employees', 'definitions'),
      join(process.cwd(), '..', 'packages', 'core', 'src', 'employees', 'definitions'),
      join(process.cwd(), '..', '..', 'packages', 'core', 'src', 'employees', 'definitions'),
    ]
    const defsDir = candidates.find(p => existsSync(p))
    if (defsDir) {
      loadEmployeeDefinitions(defsDir)
      console.log('[server-init] Employee definitions loaded from YAML')
    } else {
      console.warn('[server-init] Employee definitions directory not found. Tried:', candidates)
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
    const executionApi = createExecutionAPI()
    const routineEngine = createConversationEngine(executionApi)
    const scheduler = new RoutineScheduler(routineEngine)
    scheduler.start()
    console.log('[server-init] Routine scheduler started')
  } catch (err) {
    console.error('[server-init] Routine scheduler failed:', err)
  }

  // Start memory decay scheduler (weekly decay + prune)
  try {
    startDecayScheduler()
    console.log('[server-init] Memory decay scheduler started')
  } catch (err) {
    console.error('[server-init] Decay scheduler failed:', err)
  }

  // Start memory consolidation scheduler (Gemini insights every 12h)
  try {
    startConsolidationScheduler()
    console.log('[server-init] Memory consolidation scheduler started')
  } catch (err) {
    console.error('[server-init] Consolidation scheduler failed:', err)
  }

  // Scheduled lead sync — pull new GHL messages every hour via MCP
  // This replaces the need for GHL webhooks (which can't be created via API)
  const LEAD_SYNC_INTERVAL = 60 * 60 * 1000 // 1 hour
  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/leads/sync?all=true&days=1`)
      const json = await res.json()
      if (json.success) {
        console.log(`[lead-sync] ${json.summary}`)
      }
    } catch (err) {
      console.error('[lead-sync] Hourly sync failed:', err)
    }
  }, LEAD_SYNC_INTERVAL)

  // Run initial sync after 30s delay (let server fully boot first)
  setTimeout(async () => {
    try {
      const res = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/leads/sync?all=true&days=7`)
      const json = await res.json()
      if (json.success) {
        console.log(`[lead-sync] Initial sync: ${json.summary}`)
      }
    } catch (err) {
      console.error('[lead-sync] Initial sync failed:', err)
    }
  }, 30_000)
}
