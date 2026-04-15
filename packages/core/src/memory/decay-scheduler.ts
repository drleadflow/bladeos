/**
 * Auto-decay scheduler — gradually reduces confidence of unused memories
 * and prunes those below threshold. Pinned memories are always exempt.
 *
 * Schedule:
 *   - Decay cycle: every 7 days (configurable)
 *   - Prune cycle: runs after every decay
 *   - Decay amount: 0.05 per cycle (20 weeks to reach zero)
 *   - Prune threshold: 0.1 (memories below this are deleted)
 *   - Access window: memories accessed in the last 7 days are exempt
 */

import { memories } from '@blade/db'
import { logger } from '@blade/shared'

const DEFAULT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 1 week
const DECAY_AMOUNT = 0.05
const PRUNE_THRESHOLD = 0.1
const ACCESS_WINDOW_DAYS = 7

let _timer: ReturnType<typeof setInterval> | null = null

export interface DecayCycleResult {
  decayed: number
  pruned: number
  timestamp: string
}

/**
 * Run a single decay + prune cycle.
 * Safe to call multiple times — idempotent within reason.
 */
export function runDecayCycle(): DecayCycleResult {
  const cutoffDate = new Date(
    Date.now() - ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const decayed = memories.bulkDecay(DECAY_AMOUNT, cutoffDate)
  const pruned = memories.prune(PRUNE_THRESHOLD)

  const result: DecayCycleResult = {
    decayed,
    pruned,
    timestamp: new Date().toISOString(),
  }

  if (decayed > 0 || pruned > 0) {
    logger.info('DecayScheduler', `Decay cycle complete: ${decayed} decayed, ${pruned} pruned`)
  }

  return result
}

/**
 * Start the automatic decay scheduler.
 * Only one scheduler should run per process — use BLADE_SERVICE env var
 * to gate which process runs it.
 */
export function startDecayScheduler(intervalMs?: number): void {
  if (_timer) {
    logger.warn('DecayScheduler', 'Scheduler already running, skipping duplicate start')
    return
  }

  const interval = intervalMs ?? DEFAULT_INTERVAL_MS

  // Run once on startup (with a 30s delay to let DB initialize)
  setTimeout(() => {
    try {
      runDecayCycle()
    } catch (err) {
      logger.error('DecayScheduler', `Initial decay cycle failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  _timer = setInterval(() => {
    try {
      runDecayCycle()
    } catch (err) {
      logger.error('DecayScheduler', `Decay cycle failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, interval)

  // Don't prevent process exit
  if (_timer && typeof _timer === 'object' && 'unref' in _timer) {
    _timer.unref()
  }

  logger.info('DecayScheduler', `Started with interval ${Math.round(interval / 3600000)}h`)
}

/**
 * Stop the decay scheduler. Safe to call if not running.
 */
export function stopDecayScheduler(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
    logger.info('DecayScheduler', 'Stopped')
  }
}
