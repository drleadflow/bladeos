import { logger } from '@blade/shared'
import { setupBuiltinMonitors } from './index.js'
import { measureAllKpis } from './kpi-measurer.js'
import { checkPendingPRFeedback } from '../learning/pr-feedback.js'
import type { MonitorChecker } from './checker.js'

let checker: MonitorChecker | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Initialize the monitor system and run all monitors immediately.
 * Sets up a recurring interval to check monitors every 6 hours.
 * Safe to call multiple times — will not double-initialize.
 */
export async function startMonitorScheduler(): Promise<void> {
  if (checker) {
    logger.debug('MonitorScheduler', 'Already running, skipping re-init')
    return
  }

  try {
    checker = setupBuiltinMonitors()
    logger.info('MonitorScheduler', 'Monitor system initialized, running initial check...')

    // Run all monitors and KPI measurements immediately on startup
    const results = await checker.runAll()
    for (const [id, result] of results) {
      logger.info('MonitorScheduler', `[${id}] ${result.status}: ${result.message}`)
    }

    // Measure KPIs
    try {
      const kpiCount = await measureAllKpis()
      if (kpiCount > 0) logger.info('MonitorScheduler', `Measured ${kpiCount} KPIs on startup`)
    } catch (err) {
      logger.debug('MonitorScheduler', `KPI measurement skipped: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Check pending PR feedback
    try {
      const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
      if (githubToken) {
        const processed = await checkPendingPRFeedback(githubToken)
        if (processed > 0) logger.info('MonitorScheduler', `Processed ${processed} PR feedback(s) on startup`)
      }
    } catch (err) {
      logger.debug('MonitorScheduler', `PR feedback check skipped: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Schedule recurring checks
    intervalId = setInterval(async () => {
      try {
        logger.info('MonitorScheduler', 'Running scheduled monitor check...')
        const checkResults = await checker!.runAll()
        for (const [id, result] of checkResults) {
          if (result.status !== 'ok') {
            logger.warn('MonitorScheduler', `[${id}] ${result.status}: ${result.message}`)
          }
        }
        // Also measure KPIs
        try { await measureAllKpis() } catch { /* ignore */ }
        // Check pending PR feedback
        try {
          const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
          if (githubToken) {
            const processed = await checkPendingPRFeedback(githubToken)
            if (processed > 0) logger.info('MonitorScheduler', `Processed ${processed} PR feedback(s)`)
          }
        } catch { /* ignore */ }
      } catch (err) {
        logger.error('MonitorScheduler', `Scheduled check failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, CHECK_INTERVAL_MS)

    logger.info('MonitorScheduler', `Scheduled checks every ${CHECK_INTERVAL_MS / 3_600_000}h`)
  } catch (err) {
    logger.error('MonitorScheduler', `Failed to initialize: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Run all monitors on demand (e.g., from API endpoint).
 * Returns the latest results.
 */
export async function runMonitorsNow(): Promise<Record<string, { value: number; status: string; message: string }>> {
  if (!checker) {
    checker = setupBuiltinMonitors()
  }

  const results = await checker.runAll()
  const output: Record<string, { value: number; status: string; message: string }> = {}

  for (const [id, result] of results) {
    output[id] = { value: result.value, status: result.status, message: result.message }
  }

  return output
}

/** Stop the scheduler (for graceful shutdown). */
export function stopMonitorScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  checker = null
  logger.info('MonitorScheduler', 'Stopped')
}
